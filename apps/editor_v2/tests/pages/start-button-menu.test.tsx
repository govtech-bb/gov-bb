/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import { UNDO_COMMAND } from "lexical";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import {
  hoverPageMenu,
  pageControl,
  renderPageEditor,
  selectPageText,
} from "../helpers/page-editor";

test.each([
  { caret: "Outside list", hover: true },
  { caret: "Other start", hover: true },
  { caret: "Start now", hover: false },
])(
  "a nested Start button's menu leaves its destination to the card at the caret (hover=$hover, caret in $caret)",
  async ({ caret, hover }) => {
    await renderPageEditor(
      'Outside list\n\n1. First route\n\n   <a data-start-link href="/first">Other start</a>\n\n2. Second route\n\n   <a data-start-link href="/second">Start now</a>\n',
    );
    await selectPageText(caret);
    const start = pageControl<HTMLElement>('ol > li:nth-child(2) [data-page-component="start"]');

    if (hover) await hoverPageMenu(start);
    else
      await act(async () => pageControl<HTMLButtonElement>('[aria-label="Block options"]').click());

    expect(pageControl(".page-block-menu").textContent).not.toContain("Button destination");
    expect(start.dataset.destination).toBe("/second");
  },
);

test("nested hover settings do not change the root block used by delete and undo", async () => {
  const editor = await renderPageEditor(
    'Outside list\n\n1. Route\n\n   <a data-start-link href="/apply">Start now</a>\n',
  );

  const before = govbbPageCodec.encode(editor.getEditorState().toJSON());
  await hoverPageMenu(pageControl<HTMLElement>('[data-page-component="start"]'));

  const remove = [
    ...pageControl(".page-block-menu").querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((item) => item.textContent === "Delete block");

  expect(remove).toBeDefined();
  await act(async () => remove!.click());
  expect(pageControl(".page-editable").textContent).toBe("Outside list");
  await act(async () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  });
  expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(before);
});
