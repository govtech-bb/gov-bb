/** @vitest-environment jsdom */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  type LexicalEditor,
  type SerializedEditorState,
} from "lexical";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EditorDefinition } from "../../src/editor/core/definition";
import { EditorComposer } from "../../src/editor/react/composer";
import { InsertModal } from "../../src/editor/react/insert-modal";
import { formSchemaToLexical } from "../../src/converters/form-schema-to-lexical";
import { contentEditor } from "../../src/presets/content";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { emptyNativeForm } from "../helpers/native-form";

let host: HTMLDivElement;

let root: Root;

let editor: LexicalEditor;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no layout: the list's highlighted row has nowhere to scroll
  Element.prototype.scrollIntoView = () => {};

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
});

function Capture() {
  [editor] = useLexicalComposerContext();

  return null;
}

/** Opens the insert dialog on a new last line, then walks every entry it offers. */
async function previewSheets(definition: EditorDefinition, initialState?: SerializedEditorState) {
  const render = (targetKey: string | null) =>
    act(async () =>
      root.render(
        <EditorComposer definition={definition} initialState={initialState}>
          <Capture />
          <InsertModal
            request={targetKey ? { targetKey, mode: "insert" } : null}
            onClose={() => {}}
          />
        </EditorComposer>,
      ),
    );

  await render(null);
  let targetKey = "";
  editor.update(
    () => (targetKey = $getRoot().append($createParagraphNode()).getLastChild()!.getKey()),
    {
      discrete: true,
    },
  );
  await render(targetKey);

  const search = document.querySelector<HTMLInputElement>('input[aria-label="Search blocks"]')!;
  const sheets: Record<string, number> = {};

  for (const option of document.querySelectorAll('[role="option"]')) {
    const pane = document.querySelector('[role="listbox"]')!.nextElementSibling!;
    sheets[option.getAttribute("aria-label")!] = pane.querySelectorAll(".shadow-sheet").length;
    await act(async () => {
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
  }

  return sheets;
}

test("the insert dialog draws every block's preview on one sheet, in the form and in content", async () => {
  const form = formSchemaToLexical(emptyNativeForm, govbbFormEditor);

  if (form.status !== "ready") throw Error(form.diagnostics[0]?.message);
  const formSheets = await previewSheets(govbbFormEditor, form.state);

  expect(Object.keys(formSheets).length).toBeGreaterThan(20);
  expect(Object.entries(formSheets).filter(([, count]) => count !== 1)).toEqual([]);

  await act(async () => root.render(null));
  const contentSheets = await previewSheets(contentEditor);

  expect(Object.keys(contentSheets)).toContain("Heading 2");
  expect(Object.entries(contentSheets).filter(([, count]) => count !== 1)).toEqual([]);
});
