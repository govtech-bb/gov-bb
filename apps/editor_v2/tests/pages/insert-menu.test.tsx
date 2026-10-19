/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { pageControl, renderPageEditor, selectPageText } from "../helpers/page-editor";

async function choose(title: string) {
  const option = [
    ...document.querySelectorAll<HTMLElement>('.page-insert-menu [role="option"]'),
  ].find((row) => row.getAttribute("aria-label") === title);

  if (!option) throw new Error(`Missing insert option: ${title}`);
  await act(async () => option.click());
}

test.each([
  { altKey: false, expected: "Intro\n\n- One\n- Two\n\n##\n" },
  { altKey: true, expected: "Intro\n\n##\n\n- One\n- Two\n" },
])(
  "“+” beside the caret's list adds a block beside the list, never in its item (Alt: $altKey)",
  async ({ altKey, expected }) => {
    const editor = await renderPageEditor("Intro\n\n- One\n- Two\n");
    await selectPageText("Two");
    await act(async () =>
      pageControl('[aria-label="Insert page content"]').dispatchEvent(
        new MouseEvent("click", { bubbles: true, altKey }),
      ),
    );
    await choose("Heading 2");
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(expected);
  },
);

test("a search ranks one list, rows show their Markdown, and the footer describes the highlighted block", async () => {
  // jsdom doesn't scroll; the menu keeps its highlighted row in view
  Element.prototype.scrollIntoView = () => {};

  await renderPageEditor("Intro\n");

  const add = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Add content",
  );

  await act(async () => add!.click());
  const menu = pageControl(".page-insert-menu");
  const footer = () => menu.querySelector('p[aria-hidden="true"]')?.textContent;
  // Before a search, the blocks are in their groups
  expect(menu.querySelectorAll('[role="group"]').length).toBeGreaterThan(1);
  expect(footer()).toBe("Write a paragraph of text.");

  const search = pageControl<HTMLInputElement>('[aria-label="Search page content"]');

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "h");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(menu.querySelectorAll('[role="group"]')).toHaveLength(0);
  const rows = [...menu.querySelectorAll('[role="option"]')];
  expect(rows.slice(0, 2).map((row) => row.getAttribute("aria-label"))).toEqual([
    "Heading 2",
    "Heading 3",
  ]);
  expect(rows[0]!.textContent).toBe("Heading 2##");
  expect(footer()).toBe("Name a section of the page, such as ‘Who can apply’.");
  await act(async () =>
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
  );
  expect(footer()).toBe("Name part of a section, under a Heading 2.");
});
