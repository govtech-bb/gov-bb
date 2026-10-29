/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import { UNDO_COMMAND } from "lexical";
import { parseContentMarkdown } from "@govtech-bb/govbbmarkd";
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
])("nested Start settings use hover=$hover with the caret in $caret", async ({ caret, hover }) => {
  await renderPageEditor(
    'Outside list\n\n1. First route\n\n   <a data-start-link href="/first">Other start</a>\n\n2. Second route\n\n   <a data-start-link href="/second">Start now</a>\n',
  );
  await selectPageText(caret);
  const start = pageControl<HTMLElement>('ol > li:nth-child(2) [data-page-component="start"]');

  if (hover) await hoverPageMenu(start);
  else
    await act(async () => pageControl<HTMLButtonElement>('[aria-label="Block options"]').click());
  const input = pageControl<HTMLInputElement>(".page-component-settings input");
  expect(input.value).toBe("/second");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "/edited",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    pageControl(".page-component-settings").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(start.dataset.destination).toBe("/edited");
  expect(
    pageControl<HTMLElement>('ol > li:first-child [data-page-component="start"]').dataset
      .destination,
  ).toBe("/first");
});

test("nested hover settings do not change the root block used by delete and undo", async () => {
  const editor = await renderPageEditor(
    'Outside list\n\n1. Route\n\n   <a data-start-link href="/apply">Start now</a>\n',
  );

  const before = govbbPageCodec.encode(editor.getEditorState().toJSON());
  await hoverPageMenu(pageControl<HTMLElement>('[data-page-component="start"]'));

  const remove = [...pageControl(".page-block-menu").querySelectorAll("button")].find(
    (button) => button.textContent === "Delete block",
  );

  expect(remove).toBeDefined();
  await act(async () => remove!.click());
  expect(pageControl(".page-editable").textContent).toBe("Outside list");
  await act(async () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  });
  expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(before);
});

async function editDestination(value: string) {
  const input = pageControl<HTMLInputElement>(".page-component-settings input");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  if (!setter) throw new Error("Expected the native input value setter");
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function applySettings() {
  await act(async () => {
    pageControl(".page-component-settings").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function chooseDestination(value: string) {
  await act(async () => {
    const select = pageControl<HTMLSelectElement>(".page-component-settings select");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

test("action settings switch between registered forms, URLs and the linked form without retaining conflicting targets", async () => {
  const editor = await renderPageEditor(':::action{form="birth-certificate"}\nApply\n:::\n');
  await hoverPageMenu(pageControl<HTMLElement>('[data-page-component="action"]'));
  expect(pageControl<HTMLInputElement>(".page-component-settings input").value).toBe(
    "birth-certificate",
  );
  await editDestination("death-certificate");
  await applySettings();
  expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toContain(
    'form="death-certificate"',
  );

  await chooseDestination("url");
  await editDestination("/guidance");
  await applySettings();
  const link = govbbPageCodec.encode(editor.getEditorState().toJSON());
  expect(link).toContain('href="/guidance"');
  expect(link).not.toContain("form=");
  expect(parseContentMarkdown(link).errors).toEqual([]);

  await chooseDestination("linked-form");
  await applySettings();
  const linked = govbbPageCodec.encode(editor.getEditorState().toJSON());
  expect(linked).toContain('target="form"');
  expect(linked).not.toContain("href=");
  expect(parseContentMarkdown(linked).errors).toEqual([]);
});

test("the summary list menu adds an editable row that round-trips", async () => {
  const editor = await renderPageEditor(
    "::::summary-list\n:::summary-item[Fee]\nBBD 50\n:::\n::::\n",
  );

  await hoverPageMenu(pageControl<HTMLElement>('[data-page-component="summary-list"]'));

  const add = [...pageControl(".page-block-menu").querySelectorAll("button")].find(
    (button) => button.textContent === "Add summary item",
  );

  if (!add) throw new Error("Expected the add summary item action");
  await act(async () => add.click());
  expect(
    pageControl(".page-editable").querySelectorAll('[data-page-component="summary-item"]'),
  ).toHaveLength(2);
  const source = govbbPageCodec.encode(editor.getEditorState().toJSON());
  expect(parseContentMarkdown(source).errors).toEqual([]);
  expect(govbbPageCodec.prepare(source).mode).toBe("visual");
});
