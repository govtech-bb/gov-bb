import { expect, test } from "vitest";
import { $getRoot, $isElementNode, UNDO_COMMAND } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { $availableActions, executeAction } from "../../src/editor/core/actions";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { createEmptyPage } from "../../src/pages/converters";
import { $pageInsertionTarget } from "../../src/pages/insertion";

function page(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode === "source") throw new Error("Expected editable page");

  return createHeadlessEditor(govbbPageEditor, prepared.state);
}

test("page insertion preserves nested list paragraphs and undo removes only the inserted block", async () => {
  const editor = page("---\ntitle: Steps\n---\n\n1. First paragraph\n\n   Another paragraph\n");

  try {
    let targetKey = "";
    editor.update(
      () => {
        const list = $getRoot().getLastChild();
        const item = $isElementNode(list) ? list.getFirstChild() : null;
        const paragraph = $isElementNode(item) ? item.getFirstChild() : null;

        if (!$isElementNode(paragraph)) throw new Error("Expected nested paragraph");
        paragraph.selectEnd();
        targetKey = $pageInsertionTarget()!.getKey();
        expect(targetKey).toBe(paragraph.getKey());
      },
      { discrete: true },
    );
    const before = editor.getEditorState().toJSON();
    expect(executeAction(editor, govbbPageEditor, "page-h2", { targetKey }).executed).toBe(true);
    editor.getEditorState().read(() => {
      const list = $getRoot().getLastChild();
      const item = $isElementNode(list) ? list.getFirstChild() : null;
      expect($isElementNode(item) && item.getChildren().map((node) => node.getType())).toEqual([
        "paragraph",
        "heading",
        "paragraph",
      ]);
    });
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    editor.dispose();
  }
});

test("cell insertion offers only Markdown-compatible text while root tables offer all blocks", () => {
  const editor = page(
    "---\ntitle: Fees\n---\n\n| Service | Cost |\n| --- | --- |\n| Copy | $5 |\n",
  );

  try {
    editor.getEditorState().read(
      () => {
        const table = $getRoot().getLastChild();
        const row = $isElementNode(table) ? table.getFirstChild() : null;
        const cell = $isElementNode(row) ? row.getFirstChild() : null;
        const text = $isElementNode(cell) ? cell.getFirstChild() : null;

        if (!text || !table) throw new Error("Expected table text");
        expect(
          $availableActions(editor, govbbPageEditor, { targetKey: text.getKey() }).map(
            (action) => action.id,
          ),
        ).toEqual(["page-paragraph"]);
        expect(
          $availableActions(editor, govbbPageEditor, { targetKey: table.getKey() }).length,
        ).toBe(govbbPageEditor.actions.length);
      },
      { editor },
    );
  } finally {
    editor.dispose();
  }
});

test("consecutive block insertions are separate undo steps and metadata is never an insertion target", async () => {
  const editor = createHeadlessEditor(govbbPageEditor, createEmptyPage("New page"));

  try {
    const before = editor.getEditorState().toJSON();

    const first = editor.getEditorState().read(
      () => {
        expect(
          $availableActions(editor, govbbPageEditor, {
            targetKey: $getRoot().getFirstChild()!.getKey(),
          }),
        ).toEqual([]);

        return $getRoot().getLastChild()!.getKey();
      },
      { editor },
    );

    executeAction(editor, govbbPageEditor, "page-h2", { targetKey: first });
    const heading = editor.getEditorState().toJSON();
    const second = editor.getEditorState().read(() => $getRoot().getLastChild()!.getKey());
    executeAction(editor, govbbPageEditor, "page-notice", { targetKey: second });
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(heading);
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    editor.dispose();
  }
});
