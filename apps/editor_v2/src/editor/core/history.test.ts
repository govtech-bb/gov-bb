import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  mergeRegister,
  UNDO_COMMAND,
  type LexicalEditor,
} from "lexical";
import { historyAvailable, registerEditorHistory } from "./history";
import { $restoreEditorSelection, createEditorSession, registerEditorSession } from "./session";

test("content-only editors have independent history and unregister it without form runtime", async () => {
  const first = createEditor({
    namespace: "first",
    onError: (error) => {
      throw error;
    },
  });

  const second = createEditor({
    namespace: "second",
    onError: (error) => {
      throw error;
    },
  });

  const write = (editor: typeof first, text: string) =>
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode(text)));
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );

  const text = (editor: typeof first) =>
    editor.getEditorState().read(() => $getRoot().getTextContent());

  write(first, "First baseline");
  write(second, "Second baseline");

  const stopFirst = registerEditorHistory(first),
    stopSecond = registerEditorHistory(second);

  try {
    write(first, "First edited");
    write(second, "Second edited");
    first.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(text(first)).toBe("First baseline");
    expect(text(second)).toBe("Second edited");
    stopSecond();
    expect(second.dispatchCommand(UNDO_COMMAND, undefined)).toBe(false);
    expect(text(second)).toBe("Second edited");
  } finally {
    stopFirst();
    stopSecond();
  }
});

test("a session carries the history and selection on to the document's next editor", async () => {
  const session = createEditorSession();

  const open = () => {
    const editor = createEditor({
      namespace: "page",
      onError: (error) => {
        throw error;
      },
    });

    const stop = mergeRegister(
      registerEditorSession(editor, session),
      registerEditorHistory(editor),
    );

    return { editor, stop };
  };

  const text = (editor: LexicalEditor) =>
    editor.getEditorState().read(() => $getRoot().getTextContent());

  const first = open();
  first.editor.update(
    () => {
      $getRoot().append($createParagraphNode().append($createTextNode("Opening words")));
    },
    { discrete: true, tag: HISTORY_PUSH_TAG },
  );
  first.editor.update(
    () => {
      const words = $getRoot().getAllTextNodes()[0]!;
      words.setTextContent("Opening words, edited");
      words.select(8, 8);
    },
    { discrete: true, tag: HISTORY_PUSH_TAG },
  );
  // The view closes, leaving its history and where the caret was
  const content = first.editor.getEditorState().toJSON();
  first.stop();

  const second = open();

  try {
    second.editor.setEditorState(second.editor.parseEditorState(content), {
      tag: HISTORY_MERGE_TAG,
    });
    expect(historyAvailable(second.editor)).toEqual({ undo: true, redo: false });

    second.editor.update(() => $restoreEditorSelection(session), { discrete: true });
    second.editor.getEditorState().read(() => {
      const selection = $getSelection();

      expect($isRangeSelection(selection) && selection.anchor.getNode().getTextContent()).toBe(
        "Opening words, edited",
      );
      expect($isRangeSelection(selection) && selection.anchor.offset).toBe(8);
    });

    second.editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(text(second.editor)).toBe("Opening words");
    expect(historyAvailable(second.editor)).toEqual({ undo: true, redo: true });
  } finally {
    second.stop();
  }
});

test("a place the document no longer has leaves the selection as it is", () => {
  const session = createEditorSession();
  session.selection = {
    kind: "range",
    anchor: { path: [3, 0], offset: 2, type: "text" },
    focus: { path: [3, 0], offset: 2, type: "text" },
  };

  const editor = createEditor({
    namespace: "page",
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      $getRoot().append($createParagraphNode().append($createTextNode("Only words")));
      $restoreEditorSelection(session);
    },
    { discrete: true },
  );
  expect(editor.getEditorState().read(() => $getSelection())).toBeNull();
});
