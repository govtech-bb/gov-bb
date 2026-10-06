import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  HISTORY_PUSH_TAG,
  UNDO_COMMAND,
} from "lexical";
import { registerEditorHistory } from "./history";

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
