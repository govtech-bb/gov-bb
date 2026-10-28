/** @vitest-environment jsdom */
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Checklist, type ChecklistRow } from "./checklist";

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom lays nothing out, so has nothing to scroll
  Element.prototype.scrollIntoView = () => {};

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
});

const render = (node: ReactNode) => act(async () => root.render(node));

const rows = () => [...host.querySelectorAll<HTMLElement>("[data-row]")];

const row = (name: string) => rows().find((el) => el.textContent === name)!;

const press = (key: string) =>
  act(async () => {
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

const flat: ChecklistRow[] = [
  { key: "amount", label: "Amount", checked: true },
  { key: "choice", label: "Choice", checked: "mixed" },
  { key: "date", label: "Date", checked: false, disabled: true },
];

test("is one Tab stop of tick rows: arrows, Home and End move it, and Space ticks", async () => {
  const onCheckedChange = vi.fn();

  await render(<Checklist label="Blocks" rows={flat} onCheckedChange={onCheckedChange} />);

  const list = host.querySelector('[role="group"]')!;

  expect(list.getAttribute("aria-label")).toBe("Blocks");
  expect(rows().map((el) => [el.getAttribute("role"), el.getAttribute("aria-checked")])).toEqual([
    ["checkbox", "true"],
    ["checkbox", "mixed"],
    ["checkbox", "false"],
  ]);
  expect(rows().map((el) => el.tabIndex)).toEqual([0, -1, -1]);
  await act(async () => row("Amount").focus());
  await press("ArrowDown");
  expect(document.activeElement).toBe(row("Choice"));
  expect(rows().map((el) => el.tabIndex)).toEqual([-1, 0, -1]);
  await press(" ");
  // A partly ticked row ticks
  expect(onCheckedChange).toHaveBeenLastCalledWith("choice", true);
  await press("End");
  expect(document.activeElement).toBe(row("Date"));
  await press(" ");
  expect(onCheckedChange).toHaveBeenCalledOnce();
  await press("Home");
  expect(document.activeElement).toBe(row("Amount"));
  await act(async () => row("Amount").click());
  expect(onCheckedChange).toHaveBeenLastCalledWith("amount", false);
});

test("the row under the pointer turns navy, taking the focus once it's in the list", async () => {
  await render(<Checklist label="Blocks" rows={flat} onCheckedChange={() => {}} />);

  const navy = () => rows().filter((el) => el.hasAttribute("data-highlighted"));

  await act(async () => row("Choice").dispatchEvent(new Event("pointermove", { bubbles: true })));
  expect(navy()).toEqual([row("Choice")]);
  expect(document.activeElement).toBe(document.body);
  await act(async () => row("Amount").focus());
  expect(navy()).toEqual([row("Amount")]);
  await act(async () => row("Choice").dispatchEvent(new Event("pointermove", { bubbles: true })));
  expect(navy()).toEqual([row("Choice")]);
  expect(document.activeElement).toBe(row("Choice"));
});

const pages: ChecklistRow[] = [
  { key: "page", label: "Page 1", depth: 0, expanded: true },
  { key: "name", label: "Name", depth: 1, checked: "mixed", expanded: false },
  { key: "age", label: "Age", depth: 1, checked: false },
];

function Tree({ onExpandedChange }: { onExpandedChange: (key: string, open: boolean) => void }) {
  const [shown, setShown] = useState(pages);

  return (
    <Checklist
      label="Blocks"
      rows={shown}
      onCheckedChange={() => {}}
      onExpandedChange={(key, expanded) => {
        onExpandedChange(key, expanded);
        setShown(shown.map((r) => (r.key === key ? { ...r, expanded } : r)));
      }}
    />
  );
}

test("rows with levels make a tree that Right and Left open, close and climb", async () => {
  const onExpandedChange = vi.fn();

  await render(<Tree onExpandedChange={onExpandedChange} />);

  expect(host.querySelector('[role="tree"]')).not.toBeNull();
  expect(
    rows().map((el) => [el.getAttribute("aria-level"), el.getAttribute("aria-expanded")]),
  ).toEqual([
    ["1", "true"],
    ["2", "false"],
    ["2", null],
  ]);
  // A heading has no box to tick
  expect(row("Page 1").hasAttribute("aria-checked")).toBe(false);
  await act(async () => row("Name").focus());
  await press("ArrowRight");
  expect(onExpandedChange).toHaveBeenLastCalledWith("name", true);
  await press("ArrowLeft");
  expect(onExpandedChange).toHaveBeenLastCalledWith("name", false);
  await press("ArrowLeft");
  expect(document.activeElement).toBe(row("Page 1"));
  await press("Enter");
  expect(onExpandedChange).toHaveBeenLastCalledWith("page", false);
});

test("its search box reports what's typed, hands the arrows to the rows, and says when nothing's left", async () => {
  const onQueryChange = vi.fn();

  await render(
    <Checklist
      label="Blocks"
      rows={flat}
      onCheckedChange={() => {}}
      query=""
      onQueryChange={onQueryChange}
      searchLabel="Search blocks"
    />,
  );

  const search = host.querySelector<HTMLInputElement>('input[aria-label="Search blocks"]')!;

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "am");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onQueryChange).toHaveBeenLastCalledWith("am");
  await act(async () => search.focus());
  await press("ArrowDown");
  expect(document.activeElement).toBe(row("Amount"));
  await press("ArrowUp");
  expect(document.activeElement).toBe(search);
  await render(
    <Checklist
      label="Blocks"
      rows={[]}
      onCheckedChange={() => {}}
      query="zzz"
      onQueryChange={onQueryChange}
    />,
  );
  expect(host.textContent).toContain("No results");
});
