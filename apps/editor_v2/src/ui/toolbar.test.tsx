/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { shownText } from "../../tests/helpers/shown-text";
import { Button } from "./button";
import { Popover } from "./popover";
import { Toolbar } from "./toolbar";

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (node: ReactNode) => act(async () => root.render(node));

const control = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (button) => shownText(button) === name || button.getAttribute("aria-label") === name,
  )!;

const press = (key: string) =>
  act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });

const focused = () => document.activeElement && shownText(document.activeElement);

test("its buttons are one Tab stop, and the arrow keys, Home and End move between them", async () => {
  await render(
    <Toolbar.Root label="Page tools">
      <Button icon={<svg />} aria-label="Undo" disabled />
      <Button>Redo</Button>
      <Toolbar.Separator />
      <Button>Preview</Button>
      <Button pending pendingLabel="Saving…">
        Save
      </Button>
      <Toolbar.Button render={<button type="button">Settings</button>} />
    </Toolbar.Root>,
  );

  const toolbar = host.querySelector('[role="toolbar"]')!;

  expect(toolbar.getAttribute("aria-label")).toBe("Page tools");
  expect(toolbar.querySelector('[role="separator"]')?.getAttribute("aria-orientation")).toBe(
    "vertical",
  );
  // One Tab stop: a disabled button can't hold it, so the first that can does
  expect([...toolbar.querySelectorAll('[tabindex="0"]')].map((item) => item.textContent)).toEqual([
    "Redo",
  ]);

  await act(async () => control("Redo").focus());
  await press("ArrowRight");
  expect(focused()).toBe("Preview");
  // Working, a button keeps its place, so the arrows still reach it
  await press("ArrowRight");
  expect(focused()).toBe("Saving…");
  // A control that isn't a Button joins through Toolbar.Button
  await press("ArrowRight");
  expect(focused()).toBe("Settings");
  await press("Home");
  // Undo can't be used, so it's passed by
  expect(focused()).toBe("Redo");
  await press("End");
  expect(focused()).toBe("Settings");
  await press("ArrowLeft");
  expect(focused()).toBe("Saving…");
  // The tab stop follows the focus, so Tab out and back returns to it
  expect(control("Saving…").tabIndex).toBe(0);
  expect(control("Redo").tabIndex).toBe(-1);
});

test("a popup a control opens holds buttons of its own, not the toolbar's", async () => {
  await render(
    <Toolbar.Root label="Page tools">
      <Button>Preview</Button>
      <Popover.Root open>
        <Popover.Trigger render={<Button>About</Button>} />
        <Popover.Content aria-label="About this preview">
          <Button>Learn more</Button>
        </Popover.Content>
      </Popover.Root>
    </Toolbar.Root>,
  );

  expect(control("About").hasAttribute("tabindex")).toBe(true);
  expect(control("Learn more").hasAttribute("tabindex")).toBe(false);
});
