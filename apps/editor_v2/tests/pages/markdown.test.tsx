import { describe, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "yaml";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $nodesOfType,
  HISTORY_PUSH_TAG,
  UNDO_COMMAND,
  REDO_COMMAND,
} from "lexical";
import { $isListNode, $isListItemNode } from "@lexical/list";
import { $isTableNode } from "@lexical/table";
import {
  $generateJSONFromSelectedNodes,
  $generateNodesFromSerializedNodes,
  $insertGeneratedNodes,
} from "@lexical/clipboard";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { $pageMetadata, $setPageMetadata } from "../../src/pages/metadata";
import { PagePreview } from "../../src/pages/preview";
import { PageComponentNode } from "../../src/pages/nodes";
import { createEmptyPage } from "../../src/pages/converters";
import { parsePageMarkdown } from "../../src/pages/markdown";
import manifest from "../fixtures/pages/manifest.json";

const sourceOnly = new Set([
  "apply-to-use-state-land.md",
  "apply-for-an-nhc-rental-unit-or-lot.md",
  "tenant-notice-to-buy-freehold.md",
  "apply-for-a-position-as-a-temporary-teacher.md",
  "calculate-your-pension/about-government-pensions.md",
  "national-insurance-for-self-employed-workers/check-your-record.md",
  "national-insurance-for-self-employed-workers/index.md",
  "crop-over-permits/index.md",
  "get-marriage-certificate/start.md",
  "health-and-emergency-services/stormready/index.md",
  "post-office-redirection-business/index.md",
  "post-office-redirection-business/start.md",
  "get-death-certificate/start.md",
]);

function fixture(path: string) {
  return readFileSync(new URL(`../fixtures/pages/corpus/${path}`, import.meta.url), "utf8");
}

function visual(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode === "source") throw new Error(prepared.diagnostics[0]?.message);

  return prepared.state;
}

function checkPagePreservation(path: string, source: string) {
  const prepared = govbbPageCodec.prepare(source);
  expect(prepared.source).toBe(source);

  if (sourceOnly.has(path)) {
    expect(prepared.mode).toBe("source");
    expect(prepared.state).toBeUndefined();
    expect(prepared.diagnostics[0]?.severity).toBe("warning");

    return;
  }

  if (prepared.mode === "source") throw new Error(`${path}: ${prepared.diagnostics[0]?.message}`);
  expect(govbbPageCodec.encode(prepared.state)).toBe(source);
  const editor = createHeadlessEditor(govbbPageEditor, prepared.state);

  try {
    editor.update(() => $setPageMetadata({ title: "Edited page title" }), { discrete: true });
    const encoded = govbbPageCodec.encode(editor.getEditorState().toJSON());
    const reopened = visual(encoded);
    expect(reopened.root.children.slice(1)).toEqual(prepared.state.root.children.slice(1));
  } finally {
    editor.dispose();
  }
}

describe("frozen GovBB Markdown regressions", () => {
  test("contains three visual regression pages and all 13 source-only pages", () => {
    expect(manifest).toHaveLength(16);
    expect(manifest.filter((item) => sourceOnly.has(item.path))).toHaveLength(13);
  });

  for (const item of manifest)
    test(item.path, () => {
      const source = fixture(item.path);
      expect(createHash("sha256").update(source).digest("hex")).toBe(item.sha256);
      checkPagePreservation(item.path, source);
    });
});

describe("current GovBB landing content", () => {
  const directory = new URL("../../../landing/src/content/", import.meta.url);

  const paths = readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".md"))
    .sort();

  test("finds Markdown pages in the landing app", () => {
    expect(paths.length).toBeGreaterThan(0);
  });

  for (const path of paths)
    test(path, () => {
      checkPagePreservation(path, readFileSync(new URL(path, directory), "utf8"));
    });
});

test("birth instructions keep headings, paragraphs and Start actions inside their numbered items", () => {
  const editor = createHeadlessEditor(
    govbbPageEditor,
    visual(fixture("get-birth-certificate/index.md")),
  );

  try {
    editor.getEditorState().read(
      () => {
        const list = $getRoot()
          .getChildren()
          .find((node) => $isListNode(node) && node.getListType() === "number");

        if (!$isListNode(list)) throw new Error("Missing ordered instructions");
        const [first, second] = list.getChildren();

        if (!$isListItemNode(first) || !$isListItemNode(second))
          throw new Error("Missing instruction items");
        expect(first.getChildren().map((node) => node.getType())).toEqual([
          "heading",
          "paragraph",
          "page-component",
        ]);
        const start = first.getChildren()[2];

        if (!(start instanceof PageComponentNode)) throw new Error("Missing Start button");
        expect(start.getKind()).toBe("start");
        expect(second.getChildren().map((node) => node.getType())).toEqual([
          "heading",
          "paragraph",
          "paragraph",
        ]);
      },
      { editor },
    );
  } finally {
    editor.dispose();
  }
});

test("editing a nested Start label and destination preserves its list item through reload and undo", async () => {
  const original =
    '1. Apply online\n\n   <a data-start-link href="/apply"><strong>Start now</strong></a>\n\n2. Apply in person\n';

  const editor = createHeadlessEditor(govbbPageEditor, visual(original));

  try {
    editor.update(
      () => {
        const start = $nodesOfType(PageComponentNode).find((node) => node.getKind() === "start");
        const label = start?.getFirstChild();

        if (!start || !$isTextNode(label)) throw new Error("Missing Start label");
        start.setAttributes({ href: "/apply?next=online&ready=true" });
        label.setTextContent("Apply online now");
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    const saved = govbbPageCodec.encode(editor.getEditorState().toJSON());
    const parsed = parsePageMarkdown(saved).children[0];
    expect(parsed).toMatchObject({ type: "list", ordered: true });

    if (parsed?.type !== "list") throw new Error("Missing ordered instructions");
    expect(parsed.children).toHaveLength(2);
    expect(parsed.children[0]!.children).toHaveLength(2);
    expect(parsed.children[1]!.children).toMatchObject([
      { type: "paragraph", children: [{ type: "text", value: "Apply in person" }] },
    ]);
    expect(saved).toContain(
      '<a data-start-link href="/apply?next=online&amp;ready=true"><strong>Apply online now</strong></a>',
    );
    const reopened = createHeadlessEditor(govbbPageEditor, visual(saved));

    try {
      reopened.getEditorState().read(
        () => {
          const start = $nodesOfType(PageComponentNode).find((node) => node.getKind() === "start");
          const item = start?.getParent();
          const list = item?.getParent();
          expect(start?.getAttributes()).toEqual({ href: "/apply?next=online&ready=true" });
          expect(start?.getTextContent()).toBe("Apply online now");
          expect($isListItemNode(item)).toBe(true);
          expect($isListNode(list) && list.getListType()).toBe("number");
          expect(list?.getFirstChild()).toBe(item);
          expect(start?.getAllTextNodes()[0]?.hasFormat("bold")).toBe(true);
        },
        { editor: reopened },
      );
    } finally {
      reopened.dispose();
    }

    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(original);
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(saved);
  } finally {
    editor.dispose();
  }
});

test("start-page form association and intentionally absent description remain distinct", () => {
  const editor = createHeadlessEditor(
    govbbPageEditor,
    visual(fixture("get-birth-certificate/start.md")),
  );

  try {
    editor.update(
      () => {
        expect($pageMetadata()).toEqual({
          title: "Get a copy of a birth certificate",
          form_id: "get-birth-certificate",
          publish_date: "2026-01-13",
        });
        $getRoot().append($createParagraphNode().append($createTextNode("New instructions")));
      },
      { discrete: true },
    );
    const source = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(source).toContain("form_id: get-birth-certificate");
    expect(source).not.toContain("description:");
    expect(source).toContain("<a data-start-link>Start</a>");
  } finally {
    editor.dispose();
  }
});

test("pension tables keep header rows, alignment and content", () => {
  const editor = createHeadlessEditor(
    govbbPageEditor,
    visual(fixture("calculate-your-pension/index.md")),
  );

  try {
    editor.getEditorState().read(
      () => {
        expect($getRoot().getChildren().filter($isTableNode)).toHaveLength(2);
      },
      { editor },
    );
    editor.update(() => $setPageMetadata({ title: "Updated pension guide" }), { discrete: true });
    const source = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(source).toContain("66½");
    expect(source).toContain("Appointment date");
    expect(parsePageMarkdown(source).children.filter((node) => node.type === "table")).toHaveLength(
      2,
    );
  } finally {
    editor.dispose();
  }
});

test("page details preserve unknown YAML, comments and absent fields through edits, clears and undo", async () => {
  const source =
    "---\n# Routing metadata\ntitle: Original\ncategory: housing\npublish_date: '2026-10-06'\ncustom:\n  enabled: false\n  empty: null\n  values: [one, two]\n---\n\nBody\n";

  const editor = createHeadlessEditor(govbbPageEditor, visual(source));

  try {
    editor.update(
      () => {
        expect($pageMetadata()).toEqual({
          title: "Original",
          category: "housing",
          publish_date: "2026-10-06",
        });
        $setPageMetadata({
          title: "Changed",
          lede: "Visible introduction",
          category: undefined,
          categories: ["money-financial-support", "work-employment"],
          subcategory: "pensions",
          visibility: "preview",
          publish_date: "2026-10-07",
          form_id: "apply-for-support",
        });
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    const changed = govbbPageCodec.encode(editor.getEditorState().toJSON());
    editor.getEditorState().read(
      () =>
        expect($pageMetadata()).toEqual({
          title: "Changed",
          lede: "Visible introduction",
          categories: ["money-financial-support", "work-employment"],
          subcategory: "pensions",
          visibility: "preview",
          publish_date: "2026-10-07",
          form_id: "apply-for-support",
        }),
      { editor },
    );
    expect(changed).toContain("# Routing metadata");
    expect(changed).toContain("enabled: false");
    expect(changed).toContain("empty: null");
    expect(changed).not.toContain("description:");
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(changed);
    editor.update(
      () =>
        $setPageMetadata({
          categories: undefined,
          subcategory: undefined,
          visibility: undefined,
          publish_date: undefined,
          form_id: undefined,
        }),
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    const cleared = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(cleared).not.toMatch(/^(?:categories|subcategory|visibility|publish_date|form_id):/m);
    expect(cleared).toContain("# Routing metadata");
    expect(parse(cleared.split("---")[1]!).custom).toEqual({
      enabled: false,
      empty: null,
      values: ["one", "two"],
    });
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(changed);
  } finally {
    editor.dispose();
  }
});

test("unfamiliar page detail values survive unrelated edits without coercion", () => {
  const source =
    "---\ntitle: Original\ncategory: [custom]\ncategories: [housing, 7]\nsubcategory: false\nvisibility: { custom: true }\npublish_date: 123\n---\n\nBody\n";

  const editor = createHeadlessEditor(govbbPageEditor, visual(source));

  try {
    editor.update(
      () => {
        expect($pageMetadata()).toEqual({ title: "Original" });
        $setPageMetadata({ title: "Changed" });
      },
      { discrete: true },
    );
    const changed = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(parse(changed.split("---")[1]!)).toEqual({
      ...parse(source.split("---")[1]!),
      title: "Changed",
    });
  } finally {
    editor.dispose();
  }
});

test("empty pages and clearing the body preserve metadata", () => {
  const editor = createHeadlessEditor(govbbPageEditor, createEmptyPage("New entry page"));

  try {
    editor.update(() => $getRoot().clear(), { discrete: true });
    const source = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(source).toContain("New entry page");
  } finally {
    editor.dispose();
  }
});

test("copying page content excludes metadata and the original source", () => {
  const editor = createHeadlessEditor(
    govbbPageEditor,
    visual("---\ntitle: Metadata stays here\n---\n\nVisible body\n"),
  );

  try {
    editor.update(
      () => {
        const selection = $getRoot().select(0, $getRoot().getChildrenSize());
        const copied = $generateJSONFromSelectedNodes(editor, selection);
        expect(copied.nodes.map((node) => node.type)).toEqual(["paragraph"]);
        expect(JSON.stringify(copied)).not.toContain("Metadata stays here");
        expect(JSON.stringify(copied)).toContain("Visible body");
      },
      { discrete: true },
    );
  } finally {
    editor.dispose();
  }
});

test("select-all text replacement stays visible and keeps metadata through undo", async () => {
  const source = "---\ntitle: Keep this title\n---\n\nOriginal body\n";
  const editor = createHeadlessEditor(govbbPageEditor, visual(source));

  try {
    editor.update(
      () => {
        $getRoot().select(0, $getRoot().getChildrenSize()).insertText("Replacement body");
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    const replaced = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(replaced).toContain("Replacement body");
    editor.getEditorState().read(
      () => {
        expect($pageMetadata().title).toBe("Keep this title");
        const metadata = $getRoot().getFirstChild();
        expect($isElementNode(metadata) && metadata.getChildrenSize()).toBe(0);
        expect($getRoot().getLastChild()?.getTextContent()).toBe("Replacement body");
      },
      { editor },
    );
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(replaced);
  } finally {
    editor.dispose();
  }
});

test("pasting structured page content retains the destination metadata", () => {
  const source = createHeadlessEditor(
    govbbPageEditor,
    visual(
      "---\ntitle: Source title\n---\n\n1. #### First step\n\n   Instructions\n\n   More instructions\n",
    ),
  );

  const destination = createHeadlessEditor(
    govbbPageEditor,
    visual("---\ntitle: Destination title\n---\n\nReplace this\n"),
  );

  try {
    const copied = source
      .getEditorState()
      .read(() => $generateJSONFromSelectedNodes(source, null), { editor: source });

    destination.update(
      () => {
        const selection = $getRoot().select(0, $getRoot().getChildrenSize());
        $insertGeneratedNodes(
          destination,
          $generateNodesFromSerializedNodes(copied.nodes),
          selection,
        );
      },
      { discrete: true },
    );
    const encoded = govbbPageCodec.encode(destination.getEditorState().toJSON());
    expect(encoded).toContain("title: Destination title");
    expect(encoded).not.toContain("Source title");
    expect(encoded).toContain("#### First step");
    expect(encoded).toContain("Instructions\n\n   More instructions");
  } finally {
    source.dispose();
    destination.dispose();
  }
});

test("notices, nested details, action groups and Start labels round-trip safely", () => {
  const source =
    '---\ntitle: Components\n---\n\n:::notice\nBring **ID**.\n:::\n\n:::details{summary="What you need"}\n- First\n- Second\n:::\n\n:::actions\n::action[Continue]{href="/next"}\n::action[Help]{href="/help" variant="secondary"}\n:::\n\n<a data-start-link href="/apply?ready=true&amp;next=two">A &amp;quot; B</a>\n';

  const editor = createHeadlessEditor(govbbPageEditor, visual(source));

  try {
    editor.update(
      () => {
        $setPageMetadata({ title: "Edited components" });

        const start = $getRoot()
          .getChildren()
          .find((node) => node instanceof PageComponentNode && node.getKind() === "start");

        expect(start?.getTextContent()).toBe("A &quot; B");
      },
      { discrete: true },
    );
    const encoded = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(encoded).toContain("A &amp;quot; B");
    expect(visual(encoded).root.children.slice(1)).toEqual(
      editor.getEditorState().toJSON().root.children.slice(1),
    );

    const preview = renderToStaticMarkup(
      <PagePreview source={encoded} definition={govbbPageEditor} />,
    );

    expect(preview).toContain("<summary>What you need</summary>");
    expect(preview).toContain('href="/help"');
  } finally {
    editor.dispose();
  }
});

test.each([
  '<script>alert("unsafe")</script>',
  '<a data-start-link onclick="alert(1)">Start</a>',
  '<a data-start-link href="javascript&#58;alert(1)">Start</a>',
  '<br onmouseover="alert(1)">',
  "<!-- Keep this note -->",
  ":::specialist\nContent\n:::",
  ':::details{summary="More" onclick="x"}\nBody\n:::',
  ':::actions\n::action[Run]{href="javascript:alert(1)"}\n:::',
  "![A diagram](/diagram.svg)",
  "```js\nrun()\n```",
])("unsupported content remains original source: %s", (source) => {
  const result = govbbPageCodec.prepare(source);
  expect(result.mode).toBe("source");
  expect(result.source).toBe(source);
  expect(result.state).toBeUndefined();
});

test("invalid metadata does not produce a replacement document", () => {
  expect(() => govbbPageCodec.prepare("---\ntitle: Unclosed\n\nBody")).toThrow(
    "Correct the page metadata",
  );
  expect(() => govbbPageCodec.prepare("---\ntitle: [broken\n---\n\nBody")).toThrow(
    "Correct the page metadata",
  );
  expect(() => govbbPageCodec.prepare("---\ntitle: one\ntitle: two\n---\n")).toThrow(
    "Correct the page metadata",
  );
});

test("safe preview never injects unsupported HTML", () => {
  const preview = renderToStaticMarkup(
    <PagePreview source='<img src=x onerror="alert(1)">' definition={govbbPageEditor} />,
  );

  expect(preview).toContain("Preview is unavailable");
  expect(preview).not.toContain("<img");
});
