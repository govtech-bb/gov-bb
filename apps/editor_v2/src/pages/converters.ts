import { $createParagraphNode, $getRoot, type SerializedEditorState } from "lexical";
import type { Root } from "mdast";
import { createHeadlessEditor } from "../editor/core/create-editor";
import { SourceError, type DraftCodec, type PreparedSource } from "../persistence/types";
import type { PageEditorDefinition } from "./definition";
import {
  PageMetadataNode,
  $pageMetadataNode,
  pageMetadataFromYaml,
  validateMetadata,
} from "./metadata";
import {
  blocks,
  pageConversion,
  parsePageMarkdown,
  stringifyPageMarkdown,
  UnsupportedPageContent,
} from "./markdown";

export function readPageMetadata(source: string) {
  const frontmatter = parsePageMarkdown(source).children[0];

  return pageMetadataFromYaml(frontmatter?.type === "yaml" ? frontmatter.value : "");
}

function $body(definition: PageEditorDefinition) {
  const context = pageConversion(definition);

  const body: Root = {
    type: "root",
    children: blocks(
      $getRoot()
        .getChildren()
        .filter((node) => !(node instanceof PageMetadataNode))
        .flatMap((node) => context.$export(node)),
    ),
  };

  return stringifyPageMarkdown(body);
}

function $encode(definition: PageEditorDefinition) {
  const metadata = $pageMetadataNode();
  const yaml = metadata.getYaml();
  const canonical = `${yaml ? `---\n${yaml.trimEnd()}\n---\n\n` : ""}${$body(definition)}`;

  return { metadata, canonical };
}

export function pageMarkdownToLexical(
  source: string,
  definition: PageEditorDefinition,
): PreparedSource {
  const root = parsePageMarkdown(source, definition.frontmatter);
  const first = root.children[0];
  const yaml = first?.type === "yaml" ? first.value : "";

  if (definition.frontmatter)
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

  const editor = createHeadlessEditor(definition, undefined, { prepare: false });

  try {
    editor.update(
      () => {
        const context = pageConversion(definition);

        if (definition.frontmatter) $getRoot().append(new PageMetadataNode(yaml));

        for (const node of root.children) {
          if (node === first && node.type === "yaml") continue;
          $getRoot().append(...context.$import(node));
        }

        if ($getRoot().getChildrenSize() === (definition.frontmatter ? 1 : 0))
          $getRoot().append($createParagraphNode());
      },
      { discrete: true },
    );

    // Adjacent text nodes are normalized when the import update commits.
    if (definition.frontmatter)
      editor.update(() => $pageMetadataNode().setOriginal(source, $encode(definition).canonical), {
        discrete: true,
      });

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
        if (!definition.frontmatter) return $body(definition);
        const { metadata, canonical } = $encode(definition);

        return canonical === metadata.__fingerprint ? metadata.__original : canonical;
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

export function createEmptyBody(): SerializedEditorState {
  const page = createEmptyPage();

  return { root: { ...page.root, children: page.root.children.slice(1) } };
}
