/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Menu } from "../../src/ui/menu";
import { SsbField } from "../../src/forms/react/settings-controls";

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

const message = (pinned: boolean, onChange = vi.fn()) =>
  act(async () =>
    root.render(
      <Menu.Root defaultOpen>
        <Menu.Trigger>Error messages</Menu.Trigger>
        <Menu.Content aria-label="Error messages">
          <SsbField
            label="Required"
            value={pinned ? "Tell us your name" : "Enter your name"}
            pinned={pinned}
            onChange={onChange}
            hasDefault
          />
        </Menu.Content>
      </Menu.Root>,
    ),
  );

const field = () => document.querySelector<HTMLInputElement>("input")!;

const reset = () =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === "Reset to default",
  );

test("a message nobody wrote is labelled Default, with nothing to reset", async () => {
  await message(false);

  expect(document.querySelector(`label[for="${field().id}"]`)?.textContent).toBe("RequiredDefault");
  expect(field().value).toBe("Enter your name");
  expect(reset()).toBeUndefined();
});

test("the author's message is labelled Custom, and Reset to default clears it", async () => {
  const onChange = vi.fn();
  await message(true, onChange);

  expect(document.querySelector(`label[for="${field().id}"]`)?.textContent).toBe("RequiredCustom");
  await act(async () => reset()!.click());

  expect(onChange).toHaveBeenCalledWith(undefined);
});
