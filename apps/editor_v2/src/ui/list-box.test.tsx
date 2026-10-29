/** @vitest-environment jsdom */
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ListBox, useListNavigation } from "./list-box";
import { SearchRow } from "./search-row";
import { Popover } from "./popover";

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

const blocks = [
  { title: "Heading", group: "Text", markdown: "##" },
  { title: "Paragraph", group: "Text", markdown: "" },
  { title: "Button", group: "Actions", markdown: "::button" },
  { title: "Details", group: "Actions", markdown: ":::details" },
];

// A search over the blocks to insert, as the page editor's "+" holds it
function Insert({ onPick }: { onPick: (title: string) => void }) {
  const [query, setQuery] = useState("");
  const found = blocks.filter((block) => block.title.toLowerCase().includes(query.toLowerCase()));
  const list = useListNavigation(found.length, { onPick: (index) => onPick(found[index]!.title) });
  const groups = [...new Set(found.map((block) => block.group))];

  return (
    <Popover.Root open>
      <ListBox.Popover aria-label="Insert page content">
        <SearchRow
          aria-label="Search page content"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            list.setIndex(0);
          }}
          {...list.comboboxProps}
        />
        <ListBox.Empty>{!found.length && "No content blocks match your search."}</ListBox.Empty>
        <ListBox.Root {...list.listProps} aria-label="Blocks">
          {groups.map((group) => (
            <ListBox.Group key={group} label={group}>
              {found.map(
                (block, index) =>
                  block.group === group && (
                    <ListBox.Option
                      key={block.title}
                      {...list.optionProps(index)}
                      icon={<svg />}
                      detail={block.markdown}
                      onClick={() => onPick(block.title)}
                    >
                      {block.title}
                    </ListBox.Option>
                  ),
              )}
            </ListBox.Group>
          ))}
        </ListBox.Root>
        <ListBox.Footer>{found[list.index] && `Adds a ${found[list.index]!.title}`}</ListBox.Footer>
      </ListBox.Popover>
    </Popover.Root>
  );
}

const search = () => document.querySelector<HTMLInputElement>('[role="combobox"]')!;

const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];

const highlighted = () =>
  options()
    .filter((option) => option.getAttribute("aria-selected") === "true")
    .map((option) => option.textContent);

/** Whether the key's default, such as moving the caret, went ahead. */
const press = async (key: string) => {
  let kept = true;

  await act(async () => {
    kept = search().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });

  return kept;
};

test("the arrows move the highlight, stopping at the list's ends, Home and End move the caret, and Enter picks", async () => {
  const picked: string[] = [];

  await render(<Insert onPick={(title) => picked.push(title)} />);

  // The first row is ready for Enter, named as the field's active descendant
  expect(highlighted()).toEqual(["Heading##"]);
  expect(search().getAttribute("aria-activedescendant")).toBe(options()[0]!.id);
  expect(search().getAttribute("aria-controls")).toBe(
    document.querySelector('[role="listbox"]')!.id,
  );
  expect(options()[0]!.hasAttribute("data-highlighted")).toBe(true);

  await press("ArrowUp");
  expect(highlighted()).toEqual(["Heading##"]);

  for (const _ of options()) await press("ArrowDown");
  expect(highlighted()).toEqual(["Details:::details"]);

  // A text field keeps Home and End for its caret
  expect(await press("Home")).toBe(true);
  expect(await press("End")).toBe(true);
  expect(highlighted()).toEqual(["Details:::details"]);

  for (const _ of options()) await press("ArrowUp");
  await press("ArrowDown");
  expect(highlighted()).toEqual(["Paragraph"]);
  expect(search().getAttribute("aria-activedescendant")).toBe(options()[1]!.id);
  await press("Enter");
  expect(picked).toEqual(["Paragraph"]);
});

test("a pointer that moves highlights a row, one resting doesn't, and a press keeps the focus", async () => {
  const picked: string[] = [];

  await render(<Insert onPick={(title) => picked.push(title)} />);
  await act(async () => search().focus());

  const button = options()[2]!;

  // A row the arrows scroll under a resting pointer doesn't take the highlight
  await act(async () => {
    button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  expect(highlighted()).toEqual(["Heading##"]);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  });
  expect(highlighted()).toEqual(["Button::button"]);

  const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });

  await act(async () => {
    button.dispatchEvent(press);
  });
  expect(press.defaultPrevented).toBe(true);
  await act(async () => button.click());
  expect(picked).toEqual(["Button"]);
  expect(document.activeElement).toBe(search());
});

test("its groups are named by their headings, and the footer tells the eye what the row does", async () => {
  await render(<Insert onPick={() => {}} />);

  const groups = [...document.querySelectorAll('[role="group"]')];

  expect(
    groups.map(
      (group) => document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent,
    ),
  ).toEqual(["Text", "Actions"]);

  const footer = [...document.querySelectorAll("p")].find(
    (line) => line.textContent === "Adds a Heading",
  );

  expect(footer?.getAttribute("aria-hidden")).toBe("true");
  // In its popover, the list scrolls between the search and the footer
  const popup = document.querySelector('[aria-label="Insert page content"]')!;

  expect(popup.className).toContain("p-0");
  expect(popup.className).toContain("flex-col");
});

test("a search that finds nothing says so, out loud, where the rows were", async () => {
  await render(<Insert onPick={() => {}} />);

  const status = document.querySelector('p[role="status"]')!;

  // Waiting, empty, for its words
  expect(status.textContent).toBe("");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      search(),
      "table",
    );
    search().dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(options()).toEqual([]);
  expect(status.textContent).toBe("No content blocks match your search.");
  // Nothing to point at, and the keys do nothing
  expect(search().getAttribute("aria-expanded")).toBe("false");
  expect(search().hasAttribute("aria-activedescendant")).toBe(false);
  await press("ArrowDown");
  expect(search().hasAttribute("aria-activedescendant")).toBe(false);
});

test("the highlight scrolls into view within the list as it moves, never the page", async () => {
  await render(<Insert onPick={() => {}} />);

  const list = document.querySelector<HTMLElement>('[role="listbox"]')!;

  // A list 40px tall at the top of the screen, its rows 32px each
  list.getBoundingClientRect = () => DOMRect.fromRect({ y: 0, height: 40 });
  options().forEach((option, index) => {
    option.getBoundingClientRect = () =>
      DOMRect.fromRect({ y: index * 32 - list.scrollTop, height: 32 });
  });

  await press("ArrowDown");
  // The second row ends at 64px: the list scrolls by 24 to show it all
  expect(list.scrollTop).toBe(24);
  await press("ArrowUp");
  expect(list.scrollTop).toBe(0);
});
