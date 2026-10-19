/** @vitest-environment jsdom */
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from "lexical";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { registerEditorHistory } from "../../src/editor/core/history";
import { toastWithUndo } from "../../src/editor/react/undo-toast";
import { Toaster } from "../../src/ui/toast";

let host: HTMLDivElement;

let root: Root;

let editor: LexicalEditor;

let unregister: () => void;

const text = () => editor.getEditorState().read(() => $getRoot().getTextContent());

const undoButton = () =>
  [...document.querySelectorAll("button")].find((button) => button.textContent === "Undo");

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Toaster />));

  editor = createEditor({
    onError: (error) => {
      throw error;
    },
  });
  editor.update(
    () =>
      $getRoot().append(
        $createParagraphNode().append($createTextNode("Keep")),
        $createParagraphNode().append($createTextNode("Gone")),
      ),
    { discrete: true },
  );
  unregister = registerEditorHistory(editor);

  // The change the toast names: deleting the second line
  editor.update(() => $getRoot().getLastChild()!.remove(), {
    discrete: true,
    tag: HISTORY_PUSH_TAG,
  });
  await act(async () => toastWithUndo(editor, "Page deleted"));
});

afterEach(async () => {
  unregister();
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

test("Undo in the toast takes back the change it names, and the toast goes", async () => {
  expect(text()).toBe("Keep");
  expect(document.body.textContent).toContain("Page deleted");

  await act(async () => undoButton()!.click());
  await settle();

  expect(text()).toBe("Keep\n\nGone");
  expect(document.body.textContent).not.toContain("Page deleted");
});

test("the toast goes as soon as anything else changes, so Undo never takes back the wrong change", async () => {
  await act(async () =>
    editor.update(() => $getRoot().getFirstChild()!.remove(), { discrete: true }),
  );
  await settle();

  expect(undoButton()).toBeUndefined();
  expect(document.body.textContent).not.toContain("Page deleted");
});
