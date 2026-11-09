import { parseContentMarkdown } from "@govtech-bb/govbbmarkd";
import { $getRoot, $isTextNode } from "lexical";
import { expect, test } from "vitest";
import estate from "../../../api_v2/src/seed-data/estate.json";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";

function visual(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode === "source") throw new Error(prepared.diagnostics[0]?.message);

  return prepared.state;
}

/** The page's Markdown after `edit`, checked to reopen as what the editor held. */
function save(source: string, edit: () => void) {
  const editor = createHeadlessEditor(govbbPageEditor, visual(source));

  try {
    editor.update(edit, { discrete: true });
    const saved = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(visual(saved).root.children.slice(1)).toEqual(
      editor.getEditorState().toJSON().root.children.slice(1),
    );

    return saved;
  } finally {
    editor.dispose();
  }
}

const appendToLast = (text: string) => () => {
  const last = $getRoot().getLastDescendant();

  if (!$isTextNode(last)) throw new Error("Expected the page to end in text");
  last.setTextContent(last.getTextContent() + text);
};

test("a body edit keeps the blocks it didn't touch as they were written", () => {
  const source = [
    "Contact: **privacy@govtech.bb** or see https://alpha.gov.bb/feedback",
    "-   one\n-   two",
    "Between the lists.",
    "* three\n* four",
    "1.  first\n2.  second",
    "First line  \nSecond line",
    "Last paragraph.",
  ].join("\n\n");

  expect(save(source, appendToLast(" Edited."))).toBe(`${source} Edited.\n`);
});

test("editing Terms & Conditions leaves its contact email as written", () => {
  const terms = estate.pages.find((page) => page.url === "/terms-conditions");

  if (!terms) throw new Error("Missing /terms-conditions");
  expect(terms.body_markdown).toContain("Contact: **privacy@govtech.bb**");
  expect(save(terms.body_markdown, appendToLast(" Edited."))).toBe(
    `${terms.body_markdown} Edited.\n`,
  );
});

test("lists that open as one keep all their items when another block is edited", () => {
  // Two Markdown lists side by side open as the editor's one list, which neither list's text stands for
  const saved = save("-   one\n\n* two\n\nLast paragraph.", appendToLast(" Edited."));

  expect(parseContentMarkdown(saved).root.children.map((node) => node.type)).toEqual([
    "list",
    "paragraph",
  ]);
  expect(saved).toContain("one");
  expect(saved).toContain("two");
});
