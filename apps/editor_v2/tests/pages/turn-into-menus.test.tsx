/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { act } from "react";
import type { LexicalEditor } from "lexical";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { pageControl, renderPageEditor, selectPageText } from "../helpers/page-editor";

const body = (editor: LexicalEditor) => govbbPageCodec.encode(editor.getEditorState().toJSON());

const choice = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((item) =>
    item.textContent?.startsWith(label),
  )!;

test("Turn into in the block's menu turns the whole block, ticking what it is now", async () => {
  const editor = await renderPageEditor("- Who can apply\n- Fees\n\nSecond\n");
  await selectPageText("Fees");
  await act(async () => pageControl<HTMLButtonElement>('[aria-label="Block options"]').click());

  const row = [
    ...pageControl(".page-block-menu").querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((item) => item.textContent?.startsWith("Turn into"))!;

  expect(row.textContent).toBe("Turn intoBulleted list");
  await act(async () => row.click());
  expect(choice("Bulleted list").getAttribute("aria-checked")).toBe("true");
  expect(choice("Heading 2").textContent).toMatch(/Heading 2(⌘⌥2|Ctrl\+Alt\+2)$/);

  await act(async () => choice("Text").click());
  expect(body(editor)).toBe("Who can apply\n\nFees\n\nSecond\n");
});

test("a block that isn't text, such as a Notice, has no Turn into", async () => {
  await renderPageEditor(":::notice\nApply by Friday\n:::\n");
  await selectPageText("Apply by Friday");
  await act(async () => pageControl<HTMLButtonElement>('[aria-label="Block options"]').click());
  expect(pageControl(".page-block-menu").textContent).not.toContain("Turn into");
});

test("a shortcut turns the caret's line into its type, and back into text when it already is", async () => {
  const editor = await renderPageEditor("Fees\n");
  await selectPageText("Fees");

  const press = (init: KeyboardEventInit) =>
    act(async () => {
      pageControl(".page-editable").dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ctrlKey: true, ...init }),
      );
    });

  await press({ key: "3", code: "Digit3", altKey: true });
  expect(body(editor)).toBe("### Fees\n");
  await press({ key: "3", code: "Digit3", altKey: true });
  expect(body(editor)).toBe("Fees\n");
  await press({ key: "*", code: "Digit8", shiftKey: true });
  expect(body(editor)).toBe("- Fees\n");
});
