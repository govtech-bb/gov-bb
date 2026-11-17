/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { $getRoot, type LexicalEditor } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Editor } from "../../src/editor/react/editor";
import { contentEditor } from "../../src/presets/content";

let host: HTMLDivElement;

let root: Root;

let editor: LexicalEditor;

function CaptureEditor() {
  [editor] = useLexicalComposerContext();

  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

test("where “/” opens the insert menu, the caret's empty line says so", async () => {
  await act(async () =>
    root.render(
      <Editor definition={contentEditor} label="Content">
        <CaptureEditor />
      </Editor>,
    ),
  );

  const line = () => host.querySelector<HTMLElement>("[data-line-hint]")?.dataset.lineHint;
  expect(line()).toBeUndefined();

  await act(async () => {
    host.querySelector('[aria-label="Content"]')!.dispatchEvent(new FocusEvent("focus"));
    editor.update(() => $getRoot().selectStart(), { discrete: true });
  });
  expect(line()).toBe("Start writing, or type / to add a block.");
});
