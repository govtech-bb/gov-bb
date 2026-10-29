/** @vitest-environment jsdom */
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ListBox, useListNavigation } from "./list-box";

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
  { title: "Heading", markdown: "##" },
  { title: "Paragraph", markdown: "" },
  { title: "Button", markdown: "::button" },
  { title: "Details", markdown: ":::details" },
];

// A search over the blocks to insert, as the page editor's "+" holds it
function Insert({ onPick }: { onPick: (title: string) => void }) {
  const [query, setQuery] = useState("");
  const found = blocks.filter((block) => block.title.toLowerCase().includes(query.toLowerCase()));
  const list = useListNavigation(found.length, { onPick: (index) => onPick(found[index]!.title) });

  return (
    <>
      <input
        aria-label="Search page content"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          list.setIndex(0);
        }}
        {...list.comboboxProps}
      />
      <ListBox.Root {...list.listProps} aria-label="Blocks">
        {found.map((block, index) => (
          <ListBox.Option
            key={block.title}
            {...list.optionProps(index)}
            icon={<svg />}
            detail={block.markdown}
            onClick={() => onPick(block.title)}
          >
            {block.title}
          </ListBox.Option>
        ))}
      </ListBox.Root>
    </>
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
