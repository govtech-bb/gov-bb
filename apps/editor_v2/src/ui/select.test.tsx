/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { pill } from "./pill";
import { Select, type SelectItem } from "./select";

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

const trigger = () => host.querySelector<HTMLElement>('[role="combobox"]')!;

// The list renders in a portal outside the root
const open = () =>
  act(async () => {
    trigger().focus();
    trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });

const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];

const statuses: SelectItem[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived", disabled: true },
];

test("shows its placeholder until an item is chosen, then the item", async () => {
  const onValueChange = vi.fn();

  await render(
    <Select
      aria-label="Status"
      placeholder="Choose a status"
      items={statuses}
      onValueChange={onValueChange}
    />,
  );

  expect(trigger().textContent).toBe("Choose a status");
  await open();
  expect(options().find((option) => option.textContent === "Archived")?.ariaDisabled).toBe("true");
  await act(async () =>
    options()
      .find((option) => option.textContent === "Published")!
      .click(),
  );
  expect(onValueChange).toHaveBeenCalledWith("published");
  expect(trigger().textContent).toBe("Published");
});

test("lists items under their headings, in the order the headings first appear", async () => {
  await render(
    <Select
      aria-label="Category"
      items={[
        { value: "travel", label: "Travel", group: "Getting around" },
        { value: "tax", label: "Tax", group: "Money" },
        { value: "driving", label: "Driving", group: "Getting around" },
      ]}
    />,
  );

  await open();

  const groups = [...document.querySelectorAll('[role="group"]')].map((group) =>
    [...group.children].map((child) => child.textContent),
  );

  expect(groups).toEqual([
    ["Getting around", "Travel", "Driving"],
    ["Money", "Tax"],
  ]);
});

test("shows the first of several choices and how many more", async () => {
  await render(
    <Select
      multiple
      aria-label="Visible to"
      items={[
        { value: "applicants", label: "Applicants" },
        { value: "caseworkers", label: "Caseworkers" },
        { value: "supervisors", label: "Supervisors" },
      ]}
      defaultValue={["caseworkers", "supervisors"]}
    />,
  );

  expect(trigger().textContent).toBe("Caseworkers+1");
});

test("takes a Field's label, hint and error, which name and describe its trigger", async () => {
  await render(
    <Select
      label="Category"
      hint="Where people find this service."
      error="Choose a category"
      placeholder="Choose a category"
      items={statuses}
    />,
  );

  const text = (ids: string | null) =>
    (ids ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");

  expect(text(trigger().getAttribute("aria-labelledby"))).toBe("Category");
  expect(text(trigger().getAttribute("aria-describedby"))).toBe(
    "Where people find this service. Choose a category",
  );
  expect(trigger().getAttribute("aria-invalid")).toBe("true");
});

test("focuses its trigger from its label, without opening the list", async () => {
  await render(<Select label="Status" items={statuses} />);

  const label = document.getElementById(trigger().getAttribute("aria-labelledby")!)!;

  expect(label.tagName).toBe("DIV");
  await act(async () => label.click());
  expect(document.activeElement).toBe(trigger());
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
});

test("its trigger, and a pill's, is 44px tall under a coarse pointer, like a field", async () => {
  await render(<Select variant="pill" aria-label="How many rules" items={statuses} />);

  expect(trigger().className).toContain("pointer-coarse:min-h-11");
  expect(pill).toContain("pointer-coarse:min-h-11");
});
