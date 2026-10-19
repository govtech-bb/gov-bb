/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Menu } from "./menu";
import { TurnIntoMenu, TurnIntoSubmenu, type TurnIntoOption } from "./turn-into";

const options: TurnIntoOption[] = [
  { value: "text", label: "Text", shortcut: "⌘⌥0" },
  { value: "h2", label: "Heading 2", shortcut: "⌘⌥2" },
  { value: "bullets", label: "Bulleted list" },
];

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

const choices = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];

test("lists the types with their shortcuts as keys, ticks the current one and turns into the one picked", async () => {
  const picked: string[] = [];

  await render(
    <TurnIntoMenu
      value="h2"
      options={options}
      onValueChange={(value) => picked.push(value)}
      trigger={<button type="button">Heading 2</button>}
    />,
  );
  await act(async () => host.querySelector("button")!.click());

  expect(document.querySelector('[role="menu"]')?.getAttribute("aria-label")).toBe("Turn into");
  expect(choices().map((item) => [item.textContent, item.getAttribute("aria-checked")])).toEqual([
    ["Text⌘⌥0", "false"],
    ["Heading 2⌘⌥2", "true"],
    ["Bulleted list", "false"],
  ]);
  expect(choices()[0]!.querySelector("kbd")?.textContent).toBe("⌘⌥0");

  await act(async () => choices()[2]!.click());
  expect(picked).toEqual(["bullets"]);
});

test("in a block's menu, Turn into is a submenu row that names what the block is now", async () => {
  await render(
    <Menu.Root open>
      <Menu.Trigger>Block options</Menu.Trigger>
      <Menu.Content aria-label="Block actions">
        <TurnIntoSubmenu value="bullets" options={options} onValueChange={() => {}} />
      </Menu.Content>
    </Menu.Root>,
  );

  const row = document.querySelector<HTMLElement>('[role="menuitem"]')!;
  expect(row.textContent).toBe("Turn intoBulleted list");
  expect(row.getAttribute("aria-haspopup")).toBe("menu");
});

test("without a trigger of its own, a row like the submenu's opens the types", async () => {
  await render(<TurnIntoMenu value={null} options={options} onValueChange={() => {}} />);

  const row = host.querySelector("button")!;
  expect(row.textContent).toBe("Turn into");
  expect(row.getAttribute("aria-haspopup")).toBe("menu");

  await act(async () => row.click());
  expect(row.getAttribute("aria-expanded")).toBe("true");
  // The blocks differ, so none is ticked
  expect(choices().map((item) => item.getAttribute("aria-checked"))).toEqual([
    "false",
    "false",
    "false",
  ]);
});
