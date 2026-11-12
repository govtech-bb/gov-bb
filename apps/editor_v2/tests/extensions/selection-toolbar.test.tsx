/** @vitest-environment jsdom */
import { beforeEach, expect, test } from "vitest";
import { act } from "react";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { defineEditor, type EditorModule } from "@/editor";
import {
  FormattingModule,
  HistoryModule,
  keepSelection,
  LinksModule,
  SELECTION_TOOLBAR,
  TextModule,
} from "@/editor/modules";
import { defineSlot, Editor } from "@/editor/react";
import { Button } from "../../src/ui/button";
import { renderInPage } from "../helpers/page-editor";

// jsdom lays nothing out, where the toolbar anchors to the selected words
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 600, 40);
});

/** A control of the team's own, built from the public editor API alone: it capitalises the selected words. */
function Capitalise() {
  const [editor] = useLexicalComposerContext();

  return (
    <Button
      aria-label="Capitalise"
      onMouseDown={keepSelection}
      onClick={() =>
        editor.update(() => {
          const selection = $getSelection();

          if ($isRangeSelection(selection))
            selection.insertText(selection.getTextContent().toUpperCase());
        })
      }
    >
      Aa
    </Button>
  );
}

const CapitaliseModule = (): EditorModule => ({
  key: "example:capitalise",
  slots: [defineSlot("example:capitalise", SELECTION_TOOLBAR, Capitalise)],
});

let editor: LexicalEditor;

function CaptureEditor() {
  [editor] = useLexicalComposerContext();

  return null;
}

test("a module adds a control to the selection toolbar without editing the toolbar", async () => {
  const definition = defineEditor(
    [TextModule(), HistoryModule(), LinksModule(), FormattingModule(), CapitaliseModule()],
    "toolbar-extension",
  );

  await renderInPage(
    <Editor definition={definition} label="Content">
      <CaptureEditor />
    </Editor>,
  );
  await act(async () => {
    editor.update(
      () => {
        const text = $createTextNode("Fees for a licence");
        $getRoot().clear().append($createParagraphNode().append(text));
        text.select(0, text.getTextContentSize());
      },
      { discrete: true },
    );
  });
  // A selection made from the keyboard shows the toolbar as the key comes up
  await act(async () =>
    document
      .querySelector('[aria-label="Content"]')
      ?.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Shift" })),
  );

  const control = document.querySelector<HTMLButtonElement>(
    '[role="toolbar"][aria-label="Text formatting"] [aria-label="Capitalise"]',
  );

  expect(control).not.toBeNull();
  await act(async () => control!.click());
  expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe(
    "FEES FOR A LICENCE",
  );
});
