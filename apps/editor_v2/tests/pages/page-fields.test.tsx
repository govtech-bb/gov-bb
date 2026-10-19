/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import { $getSelection, $isRangeSelection, SKIP_DOM_SELECTION_TAG } from "lexical";
import { PageTitleField } from "../../src/pages";
import { pageControl, renderPageEditor, selectPageText } from "../helpers/page-editor";

const field = (label: string) =>
  document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!;

const type = (input: HTMLTextAreaElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

test("typing in the title leaves the page's selection where it is, and Cmd+Z there is the editor's undo", async () => {
  const editor = await renderPageEditor(
    "---\ntitle: Old title\n---\n\nBody text\n",
    <PageTitleField />,
  );

  // As after a click in the page: its selection is put back by any update that doesn't skip it
  await selectPageText("Body text");

  const tags: string[][] = [];

  editor.registerUpdateListener(({ tags: updateTags, dirtyElements, dirtyLeaves }) => {
    if (dirtyElements.size || dirtyLeaves.size) tags.push([...updateTags]);
  });

  const title = field("Page title");

  await act(async () => title.focus());
  await type(title, "Old title, edited");
  await type(title, "Old title, edited again");
  expect(title.value).toBe("Old title, edited again");
  expect(tags).toHaveLength(2);
  expect(tags.every((update) => update.includes(SKIP_DOM_SELECTION_TAG))).toBe(true);

  // Typed together, the two changes are one step, undone by the editor rather than the browser's own field undo
  await act(async () => {
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }));
  });
  expect(title.value).toBe("Old title");
});

const press = (target: Element, key: string, init: KeyboardEventInit = {}) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });

test("the title, introduction and body are one piece of writing: Enter and ArrowDown go on, ArrowUp goes back", async () => {
  // jsdom lays nothing out: the caret's box is its line's
  Range.prototype.getClientRects = () => document.body.getClientRects();

  const editor = await renderPageEditor(
    "---\ntitle: Licences\nlede: What you need\n---\n\nFirst line\n\nSecond line\n",
    <PageTitleField />,
  );

  const title = field("Page title");
  const introduction = field("Introduction");

  await act(async () => title.focus());
  await press(title, "Enter");
  expect(document.activeElement).toBe(introduction);
  expect(introduction.selectionStart).toBe(introduction.value.length);

  // ArrowDown at the end of the introduction starts the body
  await press(introduction, "ArrowDown");
  expect(
    editor.getEditorState().read(() => {
      const selection = $getSelection();

      return $isRangeSelection(selection) && selection.isCollapsed()
        ? [selection.anchor.getNode().getTextContent(), selection.anchor.offset]
        : null;
    }),
  ).toEqual(["First line", 0]);

  // ArrowUp on the body's first line goes back to the introduction, and from its start to the title
  await press(pageControl(".page-editable"), "ArrowUp");
  expect(document.activeElement).toBe(introduction);
  introduction.setSelectionRange(0, 0);
  await press(introduction, "ArrowUp");
  expect(document.activeElement).toBe(title);

  // Shift+Enter in the introduction is still a new line there
  await act(async () => introduction.focus());
  await press(introduction, "Enter", { shiftKey: true });
  expect(document.activeElement).toBe(introduction);
});
