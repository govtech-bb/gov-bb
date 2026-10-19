/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  INSERT_PARAGRAPH_COMMAND,
  type LexicalEditor,
} from "lexical";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { pageControl, renderPageEditor, selectPageText } from "../helpers/page-editor";

const enter = (editor: LexicalEditor) =>
  act(async () => {
    editor.update(() => editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined), {
      discrete: true,
    });
  });

/** The page's blocks, and the line holding the caret. */
const read = (editor: LexicalEditor) =>
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    const anchor = $isRangeSelection(selection) ? selection.anchor.getNode() : null;

    return {
      blocks: $getRoot()
        .getChildren()
        .slice(1)
        .map((node) => node.getType()),
      caret: anchor && anchor.getTopLevelElement()?.getIndexWithinParent(),
    };
  });

test.each([
  [":::notice\nRemember your ID.\n:::\n", "page-component"],
  [':::details{summary="Help"}\nMore about this.\n:::\n', "page-component"],
  ["> Quoted words\n", "quote"],
])("Enter on the empty last line of %j goes on writing below it", async (source, type) => {
  const editor = await renderPageEditor(source);

  await act(async () => {
    editor.update(
      () => {
        const block = $getRoot().getChildAtIndex(1);

        if (!$isElementNode(block)) throw new Error("Expected the block");
        const line = $createParagraphNode();
        block.append(line);
        line.select();
      },
      { discrete: true },
    );
  });
  await enter(editor);
  expect(read(editor)).toEqual({ blocks: [type, "paragraph"], caret: 2 });
  // The empty line was only for writing on: the Markdown is as it was
  expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
});

test.each([
  ['<a data-start-link href="/apply">Start now</a>\n\nAfter\n', "Start now"],
  [
    ':::actions\n::action[Continue]{href="/next"}\n::action[Back]{href="/back"}\n:::\n\nAfter\n',
    "Continue",
  ],
])("Enter in a button goes on below it, its label whole", async (source, label) => {
  const editor = await renderPageEditor(source);
  await selectPageText(label);
  await enter(editor);
  expect(read(editor)).toEqual({ blocks: ["page-component", "paragraph", "paragraph"], caret: 2 });
  expect(pageControl(".page-editable").textContent).toContain(label);
});

test("a page ending in a list keeps a line to write on below it, without changing its Markdown", async () => {
  const source = "Intro\n\n- One\n- Two\n";
  const editor = await renderPageEditor(source);
  expect(read(editor).blocks).toEqual(["paragraph", "list", "paragraph"]);
  expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(source);
});

test("a click below the last block puts the caret there, to go on writing", async () => {
  const editor = await renderPageEditor("Intro\n\n- One\n");

  const below =
    pageControl(".page-editable").parentElement!.querySelector<HTMLElement>("div.cursor-text")!;

  await act(async () => {
    below.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  });
  expect(read(editor).caret).toBe(3);
});
