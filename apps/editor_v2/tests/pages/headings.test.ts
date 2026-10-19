import { expect, test } from "vitest";
import { $getRoot } from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { rankActions } from "../../src/editor/core/actions";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";

const headings = () =>
  govbbPageEditor.actions.filter((action) => action.title.startsWith("Heading"));

test("pages offer Heading 2 and 3, find Heading 4 by searching, and no longer offer 1, 5 or 6", () => {
  expect(headings().map((action) => action.title)).toEqual(["Heading 2", "Heading 3", "Heading 4"]);
  expect(rankActions("", headings()).map((action) => action.title)).toEqual([
    "Heading 2",
    "Heading 3",
  ]);
  expect(rankActions("Heading 4", headings())[0]?.title).toBe("Heading 4");
});

test("a page with headings the menus no longer offer still opens, and keeps them", () => {
  const source = "---\ntitle: Old page\n---\n\n# One\n\n## Two\n\n##### Five\n\n###### Six\n";
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode !== "visual") throw new Error("Expected the page to open in the editor");
  const editor = createHeadlessEditor(govbbPageEditor, prepared.state);

  try {
    expect(
      editor.getEditorState().read(
        () =>
          $getRoot()
            .getChildren()
            .filter($isHeadingNode)
            .map((heading) => heading.getTag()),
        { editor },
      ),
    ).toEqual(["h1", "h2", "h5", "h6"]);
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
  } finally {
    editor.dispose();
  }
});
