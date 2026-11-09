import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  $isRootNode,
  type NodeKey,
  type SerializedEditorState,
} from "lexical";
import type { Root, RootContent } from "mdast";
import { parseContentMarkdown } from "@govtech-bb/govbbmarkd";
import { createHeadlessEditor } from "@/editor";
import {
  SourceError,
  type DraftCodec,
  type DraftSnapshot,
  type PreparedSource,
} from "../persistence/types";
import type { PageEditorDefinition } from "./definition";
import { PageMetadataNode, $pageMetadataNode, validateMetadata } from "./metadata";
import { pageMetadataFromYaml, stateMetadata, type OriginalBlock } from "./metadata-yaml";
import {
  blocks,
  pageConversion,
  parsePageMarkdown,
  splitPageMarkdown,
  stringifyPageMarkdown,
  UnsupportedPageContent,
} from "./markdown";

export function readPageMetadata(source: string) {
  const frontmatter = parsePageMarkdown(source).children[0];

  return pageMetadataFromYaml(frontmatter?.type === "yaml" ? frontmatter.value : "");
}

/**
 * A draft's page metadata, read as every key is typed: from the YAML its editor state holds, far cheaper than parsing
 * the page's Markdown. Without a state, or during a recovery, when the state can be ahead of the Markdown, it reads the
 * committed Markdown.
 */
export function draftPageMetadata(draft: Pick<DraftSnapshot, "state" | "committed" | "recovery">) {
  return (
    (!draft.recovery && draft.state && stateMetadata(draft.state)) ||
    readPageMetadata(draft.committed)
  );
}

function $encode(definition: PageEditorDefinition) {
  const context = pageConversion(definition);
  const metadata = $pageMetadataNode();

  const content = $getRoot()
    .getChildren()
    .filter((node) => !(node instanceof PageMetadataNode));

  // The empty line the editor keeps at the end of a page, to write on, isn't content
  const $emptyLast = () => {
    const last = content.at(-1);

    return content.length > 1 && $isParagraphNode(last) && last.isEmpty();
  };

  while ($emptyLast()) content.pop();

  const body: Root = {
    type: "root",
    children: blocks(content.flatMap((node) => context.$export(node))),
  };

  const yaml = metadata.getYaml();
  const frontmatter = yaml ? `---\n${yaml.trimEnd()}\n---\n\n` : "";
  const bodyMarkdown = stringifyPageMarkdown(body);

  return {
    metadata,
    canonical: frontmatter + bodyMarkdown,
    frontmatter,
    body: bodyMarkdown,
    blocks: body.children,
  };
}

/**
 * What each top-level block imported from the Markdown exports as, and where its text is. Importing can merge a block
 * into the one beside it, as adjacent lists are, so neither's text then stands for what the editor holds: those blocks
 * and their neighbours are left out.
 */
function $originalBlocks(
  imported: readonly { keys: NodeKey[]; start: number; end: number }[],
  definition: PageEditorDefinition,
): OriginalBlock[] {
  const context = pageConversion(definition);

  const merged = imported.map(({ keys }) =>
    keys.some((key) => !$isRootNode($getNodeByKey(key)?.getParent() ?? null)),
  );

  return imported.flatMap(({ keys, start, end }, index) => {
    if (merged[index] || merged[index - 1] || merged[index + 1]) return [];

    const exported = keys.flatMap((key) => {
      const node = $getNodeByKey(key);

      return node ? context.$export(node) : [];
    });

    return exported.length === 1 ? [{ key: JSON.stringify(exported[0]), start, end }] : [];
  });
}

/**
 * An edited page's blocks, with each run of blocks the edit left alone put back as the Markdown they were written in,
 * so saving rewrites only what changed. Blocks match the original's in order, by what they export as.
 */
function untouched(
  blocks: RootContent[],
  original: string,
  originals: readonly OriginalBlock[],
): RootContent[] {
  const matches: (number | undefined)[] = [];
  let next = 0;

  for (const block of blocks) {
    const key = JSON.stringify(block);
    let index = next;

    while (index < originals.length && originals[index]?.key !== key) index++;

    if (index < originals.length) {
      matches.push(index);
      next = index + 1;
    } else matches.push(undefined);
  }

  const children: RootContent[] = [];
  let run: { start: number; end: number; last: number } | undefined;

  const close = () => {
    if (run) children.push({ type: "html", value: original.slice(run.start, run.end) });
    run = undefined;
  };

  blocks.forEach((block, index) => {
    const match = matches[index];
    const written = match === undefined ? undefined : originals[match];

    if (match === undefined || !written) {
      close();
      children.push(block);
    } else if (run && match === run.last + 1) run = { ...run, end: written.end, last: match };
    else {
      close();
      run = { start: written.start, end: written.end, last: match };
    }
  });
  close();

  return children;
}

export function pageMarkdownToLexical(
  source: string,
  definition: PageEditorDefinition,
): PreparedSource {
  const parsed = parseContentMarkdown(source);
  const root = parsed.root;
  const first = root.children[0];
  const yaml = first?.type === "yaml" ? first.value : "";

  try {
    if (/^\uFEFF?---\r?\n/.test(source) && first?.type !== "yaml")
      throw new Error("Close the page metadata with a second --- line");
    validateMetadata(yaml);
  } catch (error) {
    throw new SourceError("Correct the page metadata before applying changes", [
      {
        code: "page-metadata",
        severity: "fatal",
        message: error instanceof Error ? error.message : String(error),
        line: first?.position?.start.line ?? 1,
        column: 1,
      },
    ]);
  }

  if (parsed.errors.length)
    return {
      mode: "source",
      source,
      diagnostics: parsed.errors.map((error) => ({
        code: error.code,
        severity: "warning",
        message: error.message,
        line: error.line,
        column: error.column,
      })),
    };

  const editor = createHeadlessEditor(definition, undefined, { prepare: false });
  const imported: { keys: NodeKey[]; start: number; end: number }[] = [];

  try {
    editor.update(
      () => {
        const context = pageConversion(definition);
        const metadata = new PageMetadataNode(yaml);
        $getRoot().append(metadata);

        for (const node of root.children) {
          if (node === first && node.type === "yaml") continue;
          const nodes = context.$import(node);
          $getRoot().append(...nodes);
          const start = node.position?.start.offset;
          const end = node.position?.end.offset;

          if (start !== undefined && end !== undefined)
            imported.push({ keys: nodes.map((item) => item.getKey()), start, end });
        }

        if ($getRoot().getChildrenSize() === 1) $getRoot().append($createParagraphNode());
      },
      { discrete: true },
    );
    // Adjacent text nodes are normalized when the import update commits.
    editor.update(
      () =>
        $pageMetadataNode().setOriginal(
          source,
          $encode(definition).canonical,
          $originalBlocks(imported, definition),
        ),
      { discrete: true },
    );

    return { mode: "visual", state: editor.getEditorState().toJSON(), source, diagnostics: [] };
  } catch (error) {
    if (!(error instanceof UnsupportedPageContent)) throw error;

    return {
      mode: "source",
      source,
      diagnostics: [
        {
          code: "page-source-only",
          severity: "warning",
          message: error.message,
          line: error.node.position?.start.line ?? 1,
          column: error.node.position?.start.column ?? 1,
        },
      ],
    };
  } finally {
    editor.dispose();
  }
}

export function lexicalToPageMarkdown(
  state: SerializedEditorState,
  definition: PageEditorDefinition,
) {
  const editor = createHeadlessEditor(definition, state);

  try {
    return editor.getEditorState().read(
      () => {
        const { metadata, canonical, frontmatter, body, blocks } = $encode(definition);

        if (canonical === metadata.__fingerprint) return metadata.__original;

        if (body === splitPageMarkdown(metadata.__fingerprint).body)
          return frontmatter + splitPageMarkdown(metadata.__original).body;

        if (!metadata.__blocks.length) return canonical;

        return (
          frontmatter +
          stringifyPageMarkdown({
            type: "root",
            children: untouched(blocks, metadata.__original, metadata.__blocks),
          })
        );
      },
      { editor },
    );
  } finally {
    editor.dispose();
  }
}

export function createPageDraftCodec(definition: PageEditorDefinition): DraftCodec {
  return {
    prepare: (source) => pageMarkdownToLexical(source, definition),
    encode: (state) => lexicalToPageMarkdown(state, definition),
    prepareLegacy() {
      throw new Error("Import page documents as Markdown");
    },
  };
}

export function createEmptyPage(title = ""): SerializedEditorState {
  const children = [
    {
      type: "page-metadata",
      version: 1,
      yaml: title ? `title: ${JSON.stringify(title)}\n` : "",
      original: "",
      fingerprint: "",
    },
    {
      type: "paragraph",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [],
      textFormat: 0,
      textStyle: "",
    },
  ];

  return { root: { type: "root", version: 1, direction: null, format: "", indent: 0, children } };
}
