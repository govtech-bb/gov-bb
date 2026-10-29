/** @vitest-environment jsdom */
import { act } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { $getSelection } from "lexical";
import { pageControl, pageEditor, renderPageEditor, selectPageWords } from "../helpers/page-editor";

// jsdom lays nothing out, where the toolbar anchors to the selected words
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 600, 40);
});

const toolbar = () => document.querySelector('[role="toolbar"][aria-label="Text formatting"]');

const send = (target: Element | null, type: "keydown" | "keyup", init: KeyboardEventInit) =>
  act(async () => {
    target?.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));
  });

test("Alt+F10 takes the keyboard into the formatting toolbar, and Esc there goes back to the selected words", async () => {
  await renderPageEditor("Fees for a licence\n");
  const text = pageControl(".page-editable");
  await selectPageWords("Fees for a licence");

  // A selection made from the keyboard shows the toolbar as the key comes up
  await send(text, "keyup", { key: "Shift" });
  expect(toolbar()).not.toBeNull();

  await send(text, "keydown", { key: "F10", altKey: true });
  expect(toolbar()?.contains(document.activeElement)).toBe(true);
  expect(document.activeElement?.getAttribute("tabindex")).toBe("0");

  const focus = vi.spyOn(pageEditor(), "focus");
  await send(document.activeElement, "keydown", { key: "Escape" });
  await vi.waitFor(() => expect(toolbar()).toBeNull());

  // Back to the words, still selected. jsdom moves no focus for a selection, where a browser does
  expect(focus).toHaveBeenCalled();
  expect(pageEditor().read(() => $getSelection()?.getTextContent())).toBe("Fees for a licence");
});
