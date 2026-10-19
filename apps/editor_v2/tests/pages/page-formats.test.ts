import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  IS_BOLD,
  IS_HIGHLIGHT,
  IS_SUPERSCRIPT,
  IS_UNDERLINE,
} from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";

test("formats a page can't save, such as pasted underline or highlight, come off and bold stays", () => {
  const editor = createHeadlessEditor(govbbPageEditor);

  editor.update(
    () => {
      $getRoot().append(
        $createParagraphNode().append(
          $createTextNode("Apply now").setFormat(
            IS_BOLD | IS_UNDERLINE | IS_HIGHLIGHT | IS_SUPERSCRIPT,
          ),
        ),
      );
    },
    { discrete: true },
  );

  const format = editor.getEditorState().read(() => {
    const text = $getRoot().getLastDescendant();

    return $isTextNode(text) ? text.getFormat() : undefined;
  });

  expect(format).toBe(IS_BOLD);
  expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toContain("**Apply now**");
  editor.dispose();
});
