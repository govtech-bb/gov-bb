/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import {
  $createParagraphNode,
  $getRoot,
  $isElementNode,
  type ElementNode,
  type LexicalEditor,
} from "lexical";
import { pageControl, renderPageEditor } from "../helpers/page-editor";

const hinted = () =>
  [...document.querySelectorAll<HTMLElement>("[data-line-hint]")].map(
    (line) => line.dataset.lineHint,
  );

const focusPage = (type: "focus" | "blur") =>
  act(async () => {
    pageControl(".page-editable").dispatchEvent(new FocusEvent(type));
  });

/** Puts the caret on an empty line: a new one at the end of a quote, or the list's last item emptied. */
function caretOnEmptyLine(editor: LexicalEditor, type: "quote" | "list") {
  return act(async () => {
    editor.update(
      () => {
        const block = $getRoot()
          .getChildren()
          .find((node) => node.getType() === type);

        if (!$isElementNode(block)) throw new Error(`Expected a ${type}`);

        const line =
          type === "list"
            ? block.getLastChildOrThrow<ElementNode>().clear()
            : block.append($createParagraphNode()).getLastChildOrThrow<ElementNode>();

        line.selectEnd();
      },
      { discrete: true },
    );
  });
}

test("a new page says how to begin on its first line, before it has the focus", async () => {
  await renderPageEditor("---\ntitle: New\n---\n");
  expect(hinted()).toEqual(["Start writing, or type / to add content."]);
});

test("the caret's empty line has the hint, worded for its block, while the page has the focus", async () => {
  const editor = await renderPageEditor("Intro\n\n> Quoted\n\n- Item\n");
  expect(hinted()).toEqual([]);

  await focusPage("focus");
  await caretOnEmptyLine(editor, "quote");
  expect(hinted()).toEqual(["Quote"]);

  // One line at a time: the quote's line goes quiet when the caret leaves it
  await caretOnEmptyLine(editor, "list");
  expect(hinted()).toEqual(["List item"]);

  await focusPage("blur");
  expect(hinted()).toEqual([]);
});
