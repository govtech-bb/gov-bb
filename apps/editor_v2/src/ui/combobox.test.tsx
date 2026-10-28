/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Combobox } from "./combobox";
import { Pill } from "./pill";

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

type Field = { key: string; title: string };

type Group = { label: string; items: Field[] };

const groups: Group[] = [
  {
    label: "Input fields",
    items: [
      { key: "name", title: "Full name" },
      { key: "age", title: "Age" },
    ],
  },
  { label: "Calculated fields", items: [{ key: "total", title: "Total" }] },
];

const name = groups[0]!.items[0]!;

const trigger = () => host.querySelector<HTMLElement>('[aria-label="Field"]')!;

// The list renders in a portal outside the root
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];

// Types into an input as React hears it: through the native value setter, then an input event
const type = (input: HTMLInputElement, text: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

function Fields({
  open,
  onValueChange,
}: {
  open?: boolean;
  onValueChange?: (field: Field | null) => void;
}) {
  return (
    <Combobox.Root
      items={groups}
      itemToStringLabel={(field: Field) => field.title}
      isItemEqualToValue={(a: Field, b: Field) => a.key === b.key}
      defaultOpen={open}
      onValueChange={onValueChange}
    >
      <Combobox.Trigger look="pill" aria-label="Field" placeholder="Select a field" />
      <Combobox.Content search="Search fields" empty="No fields match">
        {(group: Group) => (
          <Combobox.Group key={group.label} label={group.label} items={group.items}>
            {(field: Field) => (
              <Combobox.Item key={field.key} value={field}>
                {field.title}
              </Combobox.Item>
            )}
          </Combobox.Group>
        )}
      </Combobox.Content>
    </Combobox.Root>
  );
}

test("a pill shows its placeholder until a field is picked from the groups, then the field", async () => {
  const onValueChange = vi.fn();

  await render(<Fields open onValueChange={onValueChange} />);

  expect(trigger().textContent).toBe("Select a field");
  expect(trigger().hasAttribute("data-placeholder")).toBe(true);

  const headings = [...document.querySelectorAll('[role="group"]')].map(
    (group) => group.firstElementChild!.textContent,
  );

  expect(headings).toEqual(["Input fields", "Calculated fields"]);
  await act(async () => options()[1]!.click());
  expect(onValueChange).toHaveBeenCalledWith(groups[0]!.items[1], expect.anything());
  expect(trigger().textContent).toBe("Age");
  expect(trigger().hasAttribute("data-placeholder")).toBe(false);
});

test("its search box filters the list, and says so when nothing matches", async () => {
  await render(<Fields open />);

  const search = document.querySelector<HTMLInputElement>('input[aria-label="Search fields"]')!;

  expect(search.placeholder).toBe("Search fields");
  await type(search, "tot");
  expect(options().map((option) => option.textContent)).toEqual(["Total"]);
  await type(search, "zzz");
  expect(options()).toEqual([]);
  expect(document.body.textContent).toContain("No fields match");
});

test("Clear, inside a pill that holds the choice, clears it", async () => {
  const onValueChange = vi.fn();

  await render(
    <Combobox.Root
      items={groups}
      itemToStringLabel={(field: Field) => field.title}
      defaultValue={name}
      onValueChange={onValueChange}
    >
      <Pill>
        <Combobox.Trigger look="inline" aria-label="Field" />
        <Combobox.Clear />
      </Pill>
      <Combobox.Content>
        {(group: Group) => (
          <Combobox.Group key={group.label} items={group.items}>
            {(field: Field) => (
              <Combobox.Item key={field.key} value={field}>
                {field.title}
              </Combobox.Item>
            )}
          </Combobox.Group>
        )}
      </Combobox.Content>
    </Combobox.Root>,
  );

  expect(trigger().textContent).toBe("Full name");

  const clear = host.querySelector<HTMLElement>('[aria-label="Clear"]')!;

  await act(async () => clear.click());
  expect(onValueChange).toHaveBeenCalledWith(null, expect.anything());
  expect(host.querySelector('[aria-label="Clear"]')).toBeNull();
});
