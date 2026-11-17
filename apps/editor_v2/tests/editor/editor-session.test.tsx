/** @vitest-environment jsdom */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type SerializedEditorState,
} from "lexical";
import { act } from "react";
import { expect, test } from "vitest";
import { createEditorSession, type EditorSession } from "../../src/editor/core/session";
import { EditorComposer, EditorSessionProvider } from "../../src/editor/react/composer";
import { UndoRedo } from "../../src/editor/react/undo-redo";
import { PageEditor } from "../../src/pages/editor";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { renderInPage } from "../helpers/page-editor";

let editor: LexicalEditor;

function CaptureEditor() {
  [editor] = useLexicalComposerContext();

  return null;
}

const prepared = govbbPageCodec.prepare(
  "---\ntitle: Fees\n---\n\nFirst paragraph.\n\nSecond paragraph.\n",
);

if (prepared.mode !== "visual") throw new Error("Expected a visual page");

/** A page's view on its session, opening on the draft as it's saved. */
const view = (session: EditorSession, draft: SerializedEditorState) => (
  <EditorSessionProvider session={session}>
    <EditorComposer definition={govbbPageEditor} initialState={draft}>
      <CaptureEditor />
      <UndoRedo />
      <PageEditor />
    </EditorComposer>
  </EditorSessionProvider>
);

const undo = () => document.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!;

test("a page's view opens again with its undo history and caret, leaving focus where it is", async () => {
  const session = createEditorSession();

  await renderInPage(view(session, prepared.state));
  expect(undo().disabled).toBe(true);

  await act(async () =>
    editor.update(
      () => {
        const second = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "Second paragraph.")!;

        second.setTextContent("Second paragraph, edited.");
        second.select(6, 6);
      },
      { discrete: true },
    ),
  );

  const draft = editor.getEditorState().toJSON();
  const closed = editor;

  // The view closes while the author works elsewhere, such as on the link back to it
  await renderInPage(<p>Another page</p>);
  const elsewhere = document.body.appendChild(document.createElement("button"));
  elsewhere.focus();

  await renderInPage(view(session, draft));

  expect(editor).not.toBe(closed);
  expect(undo().disabled).toBe(false);
  editor.getEditorState().read(() => {
    const selection = $getSelection();

    expect($isRangeSelection(selection) && selection.anchor.getNode().getTextContent()).toBe(
      "Second paragraph, edited.",
    );
    expect($isRangeSelection(selection) && selection.anchor.offset).toBe(6);
  });
  // The page's own selection and focus stay with the author
  expect(editor.getRootElement()?.contains(document.getSelection()?.anchorNode ?? null)).toBe(
    false,
  );
  expect(document.activeElement).toBe(elsewhere);

  await act(async () => undo().click());
  expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toContain(
    "Second paragraph.",
  );
  elsewhere.remove();
});
