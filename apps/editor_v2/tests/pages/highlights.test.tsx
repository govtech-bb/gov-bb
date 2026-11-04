/** @vitest-environment jsdom */
import { beforeEach, expect, test } from "vitest";
import { act } from "react";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type LexicalEditor,
} from "lexical";
import { PageComponentNode } from "../../src/pages/blocks/node";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import {
  hoverPageMenu,
  pageControl,
  renderPageEditor,
  selectPageWords,
} from "../helpers/page-editor";

// jsdom lays nothing out, where the selection toolbar anchors to the selected words
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 600, 40);
});

const body = (editor: LexicalEditor) => govbbPageCodec.encode(editor.getEditorState().toJSON());

const water =
  '<highlights>\n<highlight title="Water">Store 3 gallons.</highlight>\n</highlights>\n';

const run = (editor: LexicalEditor, $change: () => void) =>
  act(async () => {
    editor.update($change, { discrete: true });
  });

const enter = (editor: LexicalEditor) =>
  run(editor, () => editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined));

const press = (editor: LexicalEditor, key: "Backspace" | "Delete") =>
  run(editor, () =>
    editor.dispatchCommand(
      key === "Backspace" ? KEY_BACKSPACE_COMMAND : KEY_DELETE_COMMAND,
      new KeyboardEvent("keydown", { key, cancelable: true }),
    ),
  );

const type = (editor: LexicalEditor, text: string) =>
  run(editor, () => {
    const selection = $getSelection();

    if ($isRangeSelection(selection)) selection.insertText(text);
  });

/** Puts the caret at the start or end of some text on the page. */
const caret = (editor: LexicalEditor, text: string, at: "start" | "end") =>
  run(editor, () => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((item) => item.getTextContent() === text);

    if (!node) throw new Error(`Missing page text: ${text}`);

    if (at === "start") node.selectStart();
    else node.selectEnd();
  });

/** What holds the caret: the part of a highlight, or another line. */
const caretIn = (editor: LexicalEditor) =>
  editor.getEditorState().read(() => {
    const selection = $getSelection();

    const line = $isRangeSelection(selection)
      ? selection.anchor.getNode().getTopLevelElement()
      : null;

    return line instanceof PageComponentNode ? line.getKind() : line?.getType();
  });

test("Highlights from the insert menu is a highlight to write its title and then its text in", async () => {
  const editor = await renderPageEditor("Intro\n");

  const add = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Add content",
  );

  await act(async () => add!.click());

  const option = [
    ...document.querySelectorAll<HTMLElement>('.page-insert-menu [role="option"]'),
  ].find((row) => row.getAttribute("aria-label") === "Highlights");

  if (!option) throw new Error("Missing the Highlights option");
  await act(async () => option.click());
  await type(editor, "Water");
  await enter(editor);
  await type(editor, "Bring ID.");
  expect(body(editor)).toBe(
    'Intro\n\n<highlights>\n<highlight title="Water">Bring ID.</highlight>\n</highlights>\n',
  );
});

test("a highlight's title is written in place", async () => {
  const editor = await renderPageEditor(water);
  const title = pageControl('[data-page-component="highlight-title"]');

  expect(title.textContent).toBe("Water");
  expect(title.closest('[contenteditable="true"]')).not.toBeNull();
  await caret(editor, "Water", "end");
  await type(editor, " and food");
  expect(body(editor)).toBe(water.replace("Water", "Water and food"));
});

test("Add highlight in the block menu adds one after the highlight at the caret", async () => {
  const editor = await renderPageEditor(water);
  await caret(editor, "Store 3 gallons.", "end");
  await hoverPageMenu(pageControl<HTMLElement>('[data-page-component="highlight"]'));

  const add = [
    ...pageControl(".page-block-menu").querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((row) => row.textContent === "Add highlight");

  await act(async () => add!.click());
  await type(editor, "Documents");
  expect(body(editor)).toBe(
    '<highlights>\n<highlight title="Water">Store 3 gallons.</highlight>\n<highlight title="Documents"></highlight>\n</highlights>\n',
  );
});

test("Enter goes from the title to the text, then to a new highlight, and from an empty last one below them", async () => {
  const editor = await renderPageEditor(water);
  await caret(editor, "Water", "end");
  await enter(editor);
  expect(caretIn(editor)).toBe("highlight-text");

  await caret(editor, "Store 3 gallons.", "end");
  await enter(editor);
  expect(
    pageControl(".page-editable").querySelectorAll('[data-page-component="highlight"]'),
  ).toHaveLength(2);
  expect(caretIn(editor)).toBe("highlight-title");

  await enter(editor);
  expect(caretIn(editor)).toBe("paragraph");
  expect(body(editor)).toBe(water);
});

test("Backspace and Delete keep a highlight's title and text apart, and take an empty highlight away", async () => {
  const editor = await renderPageEditor(
    '<highlights>\n<highlight title="Water">Store 3 gallons.</highlight>\n<highlight title="Food">Keep tins.</highlight>\n</highlights>\n',
  );

  await caret(editor, "Store 3 gallons.", "start");
  await press(editor, "Backspace");
  expect(caretIn(editor)).toBe("highlight-title");

  await caret(editor, "Water", "end");
  await press(editor, "Delete");
  await caret(editor, "Store 3 gallons.", "end");
  await press(editor, "Delete");
  expect(body(editor)).toBe(
    '<highlights>\n<highlight title="Water">Store 3 gallons.</highlight>\n<highlight title="Food">Keep tins.</highlight>\n</highlights>\n',
  );

  // Emptied, the second highlight goes with one more Backspace
  await run(editor, () => {
    const group = $getRoot().getChildAtIndex(1);
    const food = $isElementNode(group) ? group.getLastChild() : null;

    if (!$isElementNode(food)) throw new Error("Expected the second highlight");

    for (const part of food.getChildren()) if ($isElementNode(part)) part.clear();
    food.selectStart();
  });
  await press(editor, "Backspace");
  expect(body(editor)).toBe(water);
});

test("a highlight's text stays plain, as landing shows it", async () => {
  const editor = await renderPageEditor(water);
  await selectPageWords("Store 3 gallons.");
  await act(async () =>
    pageControl(".page-editable").dispatchEvent(
      new KeyboardEvent("keyup", { bubbles: true, key: "Shift" }),
    ),
  );
  // No toolbar to format the words with
  expect(document.querySelector('[role="toolbar"][aria-label="Text formatting"]')).toBeNull();

  // Formatting pasted in comes off
  await run(editor, () => {
    const text = $getRoot().getAllTextNodes()[1];

    if ($isTextNode(text)) text.toggleFormat("bold");
  });
  expect(body(editor)).toBe(water);
});
