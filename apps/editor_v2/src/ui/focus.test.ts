/** @vitest-environment jsdom */
import { expect, test } from "vitest";
import { openedByTouch, pressedByTouch } from "./focus";

const press = (pointerType: string) =>
  document.body.dispatchEvent(
    Object.assign(new Event("pointerdown", { bubbles: true }), { pointerType }),
  );

test("a popup opened from state after a tap takes the focus itself, and after a click or a key its field does", () => {
  press("touch");
  expect(pressedByTouch()).toBe(true);
  expect(openedByTouch("")).toBe(true);

  press("mouse");
  expect(openedByTouch("")).toBe(false);

  press("touch");
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(pressedByTouch()).toBe(false);
  expect(openedByTouch("")).toBe(false);

  // Base UI's own open type, where its trigger opened it, decides
  expect(openedByTouch("touch")).toBe(true);
  expect(openedByTouch("mouse")).toBe(false);
});
