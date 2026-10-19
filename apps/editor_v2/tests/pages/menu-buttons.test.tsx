/** @vitest-environment jsdom */
import { act } from "react";
import { expect, test } from "vitest";
import { pageControl, renderPageEditor, selectPageText } from "../helpers/page-editor";

const state = (button: HTMLElement) => [
  button.getAttribute("aria-haspopup"),
  button.getAttribute("aria-expanded"),
];

test("Insert, Block options and Add content say they open a popup, and which one is open", async () => {
  await renderPageEditor("Renew your passport at the counter.\n");
  await selectPageText("Renew your passport at the counter.");

  const insert = pageControl('[aria-label="Insert page content"]');
  const options = pageControl('[aria-label="Block options"]');

  const add = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Add content",
  )!;

  expect([insert, options, add].map(state)).toEqual([
    ["dialog", "false"],
    ["dialog", "false"],
    ["dialog", "false"],
  ]);

  await act(async () => options.click());
  expect([insert, options, add].map(state)).toEqual([
    ["dialog", "false"],
    ["dialog", "true"],
    ["dialog", "false"],
  ]);
  expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(
    "Block options",
  );

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await act(async () => add.click());
  expect([insert, options, add].map(state)).toEqual([
    ["dialog", "false"],
    ["dialog", "false"],
    ["dialog", "true"],
  ]);
});
