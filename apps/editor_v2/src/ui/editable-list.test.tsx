/** @vitest-environment jsdom */
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EditableList } from "./editable-list";
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

const menuButton = (name: string) => host.querySelector<HTMLElement>(`[aria-label="${name}"]`)!;

const open = (name: string) => act(async () => menuButton(name).click());

// The menu renders in a portal outside the root
const rows = () =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) => [
    item.textContent,
    item.hasAttribute("data-disabled"),
  ]);

const choose = (name: string) =>
  act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent === name)!
      .click(),
  );

function Conditions({ onAdd }: { onAdd?: () => void }) {
  const [items, setItems] = useState(["Age", "Name", "Total"]);

  return (
    <EditableList
      items={items}
      label="Conditions"
      itemLabel={(item) => `Condition ${item}`}
      itemKey={(item) => item}
      onMove={(from, to) => {
        const next = [...items];
        next.splice(to, 0, ...next.splice(from, 1));
        setItems(next);
      }}
      onDuplicate={(index) => setItems([...items, `${items[index]} copy`])}
      onRemove={(index) => setItems(items.filter((_, at) => at !== index))}
      onAdd={onAdd ?? (() => setItems([...items, `New ${items.length}`]))}
      addLabel="Add condition"
      actions={() => <Menu.Item>Wrap in group</Menu.Item>}
    >
      {(item) => <span>{item}</span>}
    </EditableList>
  );
}

const shown = () => [...host.querySelectorAll("li > div")].map((slot) => slot.textContent);

test("each row's menu leads with its own rows, then moves, unavailable at the ends, and Remove last", async () => {
  await render(<Conditions />);

  expect(host.querySelector("ul")!.getAttribute("aria-label")).toBe("Conditions");
  await open("Condition Age options");
  expect(rows()).toEqual([
    ["Wrap in group", false],
    ["Move up", true],
    ["Move down", false],
    ["Duplicate", false],
    ["Remove", false],
  ]);
  await choose("Move down");
  expect(shown()).toEqual(["Name", "Age", "Total"]);
  await open("Condition Total options");
  expect(rows()).toContainEqual(["Move down", true]);
});

test("a move is announced with the row's new place", async () => {
  await render(<Conditions />);

  await open("Condition Total options");
  await choose("Move up");
  expect(shown()).toEqual(["Age", "Total", "Name"]);
  expect(host.querySelector('[role="status"]')!.textContent).toBe("Moved up, now 2 of 3");
});

test("a removal hands the focus to the row now in its place, then the last row, then Add", async () => {
  await render(<Conditions />);

  await open("Condition Name options");
  await choose("Remove");
  expect(shown()).toEqual(["Age", "Total"]);
  expect(document.activeElement).toBe(menuButton("Condition Total options"));
  await open("Condition Total options");
  await choose("Remove");
  expect(document.activeElement).toBe(menuButton("Condition Age options"));
  await open("Condition Age options");
  await choose("Remove");
  expect(host.querySelector("ul")).toBeNull();
  expect(document.activeElement!.textContent).toBe("Add condition");
});

test("Add sits under the list, named for what it adds", async () => {
  const onAdd = vi.fn();

  await render(<Conditions onAdd={onAdd} />);

  const add = [...host.querySelectorAll("button")].at(-1)!;

  expect(add.textContent).toBe("Add condition");
  await act(async () => add.click());
  expect(onAdd).toHaveBeenCalledOnce();
});
