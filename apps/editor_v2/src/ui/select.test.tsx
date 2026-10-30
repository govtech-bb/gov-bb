/** @vitest-environment jsdom */
import { act, createRef, type ReactNode } from "react";
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

test("a filter's item valued \"\" is everything, which isn't a choice; any other item narrows the list", async () => {
  await render(
    <Select
      variant="filter"
      aria-label="Category"
      items={[
        { value: "", label: "All categories" },
        { value: "housing", label: "Housing" },
      ]}
      defaultValue=""
    />,
  );

  // The chosen blue hangs off Base UI's data-placeholder, which "" leaves in place
  expect(trigger().textContent).toBe("All categories");
  expect(trigger().hasAttribute("data-placeholder")).toBe(true);
  await open();
  await act(async () =>
    options()
      .find((option) => option.textContent === "Housing")!
      .click(),
  );
  expect(trigger().textContent).toBe("Housing");
  expect(trigger().hasAttribute("data-placeholder")).toBe(false);
});

test("a filter of several shows everything, its placeholder, in the words of a choice", async () => {
  await render(
    <Select
      variant="filter"
      multiple
      aria-label="Status"
      placeholder="All statuses"
      items={statuses}
    />,
  );

  expect(trigger().textContent).toBe("All statuses");
  expect(trigger().hasAttribute("data-placeholder")).toBe(true);
  expect(trigger().querySelector(".text-placeholder")).toBeNull();
});

test("its parts make a quiet pill with a footer under its list, and the trigger takes a ref", async () => {
  const ref = createRef<HTMLButtonElement>();
  const onValueChange = vi.fn();

  await render(
    <Select.Root
      items={[
        { value: "number", label: "Number", icon: <svg data-testid="number" /> },
        { value: "text", label: "Text" },
      ]}
      defaultValue="number"
      onValueChange={onValueChange}
    >
      <Select.Trigger ref={ref} look="pill" tone="quiet" aria-label="Value type" />
      <Select.Content footer={<button type="button">Add a type</button>}>
        <Select.Group label="Types">
          <Select.Item value="number">Number</Select.Item>
          <Select.Item value="text">Text</Select.Item>
        </Select.Group>
      </Select.Content>
    </Select.Root>,
  );

  expect(ref.current).toBe(trigger());
  // The chosen item's icon comes with its label; the pill's look is ./pill's, in its quiet tone, at 32px
  expect(trigger().textContent).toBe("Number");
  expect(trigger().querySelector('[data-testid="number"]')).not.toBeNull();
  expect(trigger().className).toContain("bg-tint");
  expect(trigger().className).toContain("h-8");
  await open();
  expect(document.querySelector('[role="group"]')!.firstElementChild!.textContent).toBe("Types");
  expect(document.querySelector('[role="listbox"]')!.nextElementSibling!.textContent).toBe(
    "Add a type",
  );
  await act(async () =>
    options()
      .find((option) => option.textContent === "Text")!
      .click(),
  );
  expect(onValueChange).toHaveBeenCalledWith("text", expect.anything());
  expect(trigger().textContent).toBe("Text");
});

test("an icon-only trigger shows the chosen icon, its label left to screen readers", async () => {
  await render(
    <Select.Root
      items={[{ value: "eq", label: "is equal to", icon: <svg data-testid="equals" /> }]}
      defaultValue="eq"
    >
      <Select.Trigger look="pill" iconOnly aria-label="Operator" />
      <Select.Content>
        <Select.Item value="eq">is equal to</Select.Item>
      </Select.Content>
    </Select.Root>,
  );

  expect(trigger().querySelector('[data-testid="equals"]')).not.toBeNull();
  expect(trigger().querySelector(".sr-only")!.textContent).toBe("is equal to");
});

test("a trigger's words stand in for the chosen item, and a field is 36px unless small", async () => {
  await render(
    <Select.Root multiple items={statuses} defaultValue={["draft", "published"]}>
      <Select.Trigger aria-label="Statuses" size="sm">
        Draft, Published
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="draft">Draft</Select.Item>
      </Select.Content>
    </Select.Root>,
  );

  expect(trigger().textContent).toBe("Draft, Published");
  expect(trigger().className).toContain("h-8");
  expect(trigger().className).not.toContain("h-9");
});
