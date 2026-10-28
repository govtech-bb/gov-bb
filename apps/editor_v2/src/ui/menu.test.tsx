/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Menu } from "./menu";

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

// The menu renders in a portal outside the root
function row(name: string) {
  const found = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((item) =>
    item.textContent?.startsWith(name),
  );

  if (!found) throw new Error(`Missing menu row: ${name}`);

  return found;
}

const trigger = () => host.querySelector("button")!;

test("runs an item's action, with its shortcut at the end of the row, and closes", async () => {
  const duplicate = vi.fn();

  await render(
    <Menu.Root defaultOpen>
      <Menu.Trigger>Actions</Menu.Trigger>
      <Menu.Content aria-label="Block actions">
        <Menu.Item detail="⌘ D" onClick={duplicate}>
          Duplicate
        </Menu.Item>
        <Menu.Item variant="danger">Delete</Menu.Item>
      </Menu.Content>
    </Menu.Root>,
  );

  expect(row("Duplicate").textContent).toBe("Duplicate⌘ D");
  await act(async () => row("Duplicate").click());
  expect(duplicate).toHaveBeenCalledOnce();
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
});

test("ticks a row and stays open for the next one", async () => {
  const onCheckedChange = vi.fn();

  await render(
    <Menu.Root defaultOpen>
      <Menu.Trigger>Settings</Menu.Trigger>
      <Menu.Content aria-label="Question settings">
        <Menu.CheckboxItem checked={false} onCheckedChange={onCheckedChange}>
          Optional
        </Menu.CheckboxItem>
      </Menu.Content>
    </Menu.Root>,
  );

  await act(async () => row("Optional").click());
  expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
});

test("shows a submenu's current choice in the row that opens it", async () => {
  await render(
    <Menu.Root defaultOpen>
      <Menu.Trigger>Settings</Menu.Trigger>
      <Menu.Content aria-label="Question settings">
        <Menu.Sub>
          <Menu.SubTrigger detail="Medium">Width</Menu.SubTrigger>
          <Menu.SubContent aria-label="Width">
            <Menu.RadioGroup value="medium">
              <Menu.RadioItem value="medium">Medium</Menu.RadioItem>
            </Menu.RadioGroup>
          </Menu.SubContent>
        </Menu.Sub>
      </Menu.Content>
    </Menu.Root>,
  );

  expect(row("Width").textContent).toBe("WidthMedium");
  expect(row("Width").getAttribute("aria-haspopup")).toBe("menu");
});

test("is named by its own label, not by the button that opens it", async () => {
  await render(
    <Menu.Root defaultOpen>
      <Menu.Trigger aria-label="Move this block by dragging" />
      <Menu.Content aria-label="Block actions">
        <Menu.Item>Duplicate</Menu.Item>
      </Menu.Content>
    </Menu.Root>,
  );

  const menu = document.querySelector('[role="menu"]')!;

  expect(menu.getAttribute("aria-label")).toBe("Block actions");
  expect(menu.hasAttribute("aria-labelledby")).toBe(false);
});

test("a switch row flips its setting and stays open, its switch sliding as the kit's does", async () => {
  const onCheckedChange = vi.fn();

  await render(
    <Menu.Root defaultOpen>
      <Menu.Trigger>Settings</Menu.Trigger>
      <Menu.Content aria-label="Question settings">
        <Menu.SwitchItem defaultChecked={false} onCheckedChange={onCheckedChange}>
          Required
        </Menu.SwitchItem>
      </Menu.Content>
    </Menu.Root>,
  );

  const required = row("Required");
  const track = required.lastElementChild!;

  expect(required.getAttribute("role")).toBe("menuitemcheckbox");
  expect(required.getAttribute("aria-checked")).toBe("false");
  expect(track.className).toContain("group/switch");
  expect(track.firstElementChild!.className).toContain("group-data-checked/switch:translate-x-3");
  await act(async () => required.click());
  expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
  expect(required.getAttribute("aria-checked")).toBe("true");
  expect(track.hasAttribute("data-checked")).toBe(true);
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
});

test("a field row is labelled, and its keys don't move the menu's highlight", async () => {
  const onKeyDown = vi.fn();

  await render(
    <Menu.Root defaultOpen>
      <Menu.Trigger>Settings</Menu.Trigger>
      <Menu.Content aria-label="Question settings">
        <Menu.Field label="Internal alias" hint="Names a blank question." onKeyDown={onKeyDown} />
        <Menu.Item>Duplicate</Menu.Item>
      </Menu.Content>
    </Menu.Root>,
  );

  const input = document.querySelector<HTMLInputElement>('[role="menu"] input')!;
  const label = document.querySelector(`label[for="${input.id}"]`)!;

  expect(label.textContent).toBe("Internal alias");
  expect(document.getElementById(input.getAttribute("aria-describedby")!)!.textContent).toBe(
    "Names a blank question.",
  );

  const press = (target: Element, key: string) =>
    act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });

  await press(input, "d");
  await press(input, "ArrowDown");
  expect(onKeyDown).toHaveBeenCalledTimes(2);
  expect(row("Duplicate").hasAttribute("data-highlighted")).toBe(false);
  // The same arrow on the menu itself moves the highlight
  await press(document.querySelector('[role="menu"]')!, "ArrowDown");
  expect(row("Duplicate").hasAttribute("data-highlighted")).toBe(true);
  // Esc is still the menu's: it closes it
  await press(input, "Escape");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
});
