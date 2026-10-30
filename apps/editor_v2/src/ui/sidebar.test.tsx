/** @vitest-environment jsdom */
import { IconContext } from "@phosphor-icons/react";
import { act, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Sidebar, useSidebar } from "./sidebar";

let host: HTMLDivElement;

let root: Root;

// Whether the window is wide enough for the column beside the page
let wide = true;

const listeners = new Set<() => void>();

const memory = "test:sidebar-collapsed";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wide,
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  listeners.clear();
  localStorage.clear();
  wide = true;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const added = vi.fn();

function Service() {
  const sidebar = useSidebar(memory);

  return (
    <>
      <Sidebar.Toggle sidebar={sidebar}>Pages</Sidebar.Toggle>
      <Sidebar.Root sidebar={sidebar} label="Service documents">
        <Sidebar.Header />
        <Sidebar.Content>
          <Sidebar.Group label="Pages">
            <Sidebar.Item current render={<a href="#entry" />}>
              Entry page
            </Sidebar.Item>
            <Sidebar.Item render={<a href="#fees" />}>Fees</Sidebar.Item>
          </Sidebar.Group>
          <Sidebar.Separator />
          <Sidebar.Group>
            <Sidebar.Item render={<a href="#form" />}>Application form</Sidebar.Item>
          </Sidebar.Group>
          <Sidebar.Empty>Add an entry page to explain this service.</Sidebar.Empty>
          <Sidebar.Actions>
            <button type="button" onClick={added}>
              Add document
            </button>
          </Sidebar.Actions>
        </Sidebar.Content>
      </Sidebar.Root>
    </>
  );
}

const render = () => act(async () => root.render(<Service />));

const toggle = () =>
  [...host.querySelectorAll("button")].find((button) => button.textContent === "Pages")!;

const nav = () => document.querySelector<HTMLElement>('nav[aria-label="Service documents"]');

const link = (name: string) =>
  [...document.querySelectorAll("a")].find((item) => item.textContent === name)!;

const resize = (next: boolean) =>
  act(async () => {
    wide = next;

    for (const listener of listeners) listener();
  });

test("beside the page, its navigation is named and titled by its label", async () => {
  await render();

  expect(nav()?.hidden).toBe(false);
  expect(nav()?.firstElementChild?.firstElementChild?.textContent).toBe("Service documents");
  expect(toggle().getAttribute("aria-expanded")).toBe("true");
  expect(toggle().getAttribute("aria-controls")).toBe(nav()?.id);
});

test("a group's label names its list of rows, and only the current row says so", async () => {
  await render();

  const [pages, form] = host.querySelectorAll("ul");

  expect(document.getElementById(pages!.getAttribute("aria-labelledby")!)?.textContent).toBe(
    "Pages",
  );
  expect(form!.hasAttribute("aria-labelledby")).toBe(false);
  expect(link("Entry page").getAttribute("href")).toBe("#entry");
  expect(link("Entry page").getAttribute("aria-current")).toBe("page");
  expect(link("Fees").hasAttribute("aria-current")).toBe(false);
  expect(link("Fees").className).toBe(link("Entry page").className);
  expect(host.querySelector("hr")).not.toBeNull();
  expect(host.querySelector("p")?.textContent).toBe("Add an entry page to explain this service.");
});

test("collapsing the column gives the page its width, and this browser remembers it", async () => {
  await render();
  await act(async () => toggle().click());

  expect(nav()?.hidden).toBe(true);
  expect(toggle().getAttribute("aria-expanded")).toBe("false");

  // Opened again later, it stays collapsed until it's shown
  await act(async () => root.render(<></>));
  await render();

  expect(nav()?.hidden).toBe(true);
  await act(async () => toggle().click());
  expect(nav()?.hidden).toBe(false);
  expect(localStorage.getItem(memory)).toBeNull();
});

test("without storage, it opens beside the page and still collapses", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Storage is blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage is blocked");
  });
  await render();

  expect(nav()?.hidden).toBe(false);
  await act(async () => toggle().click());
  expect(nav()?.hidden).toBe(true);
});

test("on a narrow screen, Pages opens it as a drawer that closes once a row is chosen", async () => {
  wide = false;
  await render();

  expect(nav()).toBeNull();
  expect(toggle().getAttribute("aria-expanded")).toBe("false");

  await act(async () => toggle().click());

  const drawer = document.querySelector('[role="dialog"]')!;

  expect(document.getElementById(drawer.getAttribute("aria-labelledby")!)?.textContent).toBe(
    "Service documents",
  );
  // The drawer's title row stands in for the header
  expect(drawer.querySelectorAll(String.raw`div.min-h-\(--bar-height\)`)).toHaveLength(1);
  expect(toggle().getAttribute("aria-controls")).toBe(drawer.id);

  await act(async () => link("Fees").click());
  await vi.waitFor(() => expect(toggle().getAttribute("aria-expanded")).toBe("false"));
});

test("in the drawer, an action runs and the drawer closes so what it opens is in reach", async () => {
  wide = false;
  await render();
  await act(async () => toggle().click());

  const add = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (button) => button.textContent === "Add document",
  )!;

  await act(async () => add.click());

  expect(added).toHaveBeenCalled();
  await vi.waitFor(() => expect(toggle().getAttribute("aria-expanded")).toBe("false"));
});

test("narrowing the window doesn't spring the drawer open over the page", async () => {
  await render();
  await resize(false);

  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(toggle().getAttribute("aria-expanded")).toBe("false");

  await resize(true);
  expect(nav()?.hidden).toBe(false);
});

// An icon that shows the weight it's drawn in
function Mark() {
  return <svg data-weight={useContext(IconContext).weight} />;
}

function Sections({ rail = false }: { rail?: boolean }) {
  const sidebar = useSidebar();

  return (
    <>
      <Sidebar.Toggle sidebar={sidebar} icon={<svg data-icon="menu" />}>
        Open menu
      </Sidebar.Toggle>
      <Sidebar.Root sidebar={sidebar} label="Menu" rail={rail}>
        <Sidebar.Content>
          <Sidebar.Group label="Content">
            <Sidebar.Item current icon={<Mark />} render={<a href="#services" />}>
              Services
            </Sidebar.Item>
          </Sidebar.Group>
          <Sidebar.Group label="Manage">
            <Sidebar.Item
              icon={<Mark />}
              status={<span>Draft</span>}
              nested={<li>Archived</li>}
              render={<a href="#categories" />}
            >
              Categories
            </Sidebar.Item>
          </Sidebar.Group>
        </Sidebar.Content>
      </Sidebar.Root>
    </>
  );
}

const anchor = (href: string) => document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!;

const weight = (href: string) => anchor(href).querySelector("svg")?.getAttribute("data-weight");

const groupNames = () =>
  [...host.querySelectorAll("nav > div > div > ul")].map(
    (list) => document.getElementById(list.getAttribute("aria-labelledby")!)?.textContent,
  );

test("an item's icon leads its row, filled while the row is current", async () => {
  await act(async () => root.render(<Sections />));

  expect(weight("#services")).toBe("fill");
  expect(weight("#categories")).toBe("regular");
  expect(groupNames()).toEqual(["Content", "Manage"]);
  expect(anchor("#categories").textContent).toBe("CategoriesDraft");
});

test("folded to a rail, a row is its icon alone, still named by its words", async () => {
  await act(async () => root.render(<Sections rail />));

  // The words stay for screen readers, and groups keep their names
  expect(anchor("#services").getAttribute("aria-current")).toBe("page");
  expect(anchor("#services").querySelector(".sr-only")?.textContent).toBe("Services");
  expect(weight("#services")).toBe("fill");
  expect(groupNames()).toEqual(["Content", "Manage"]);
  // A status and nested rows need words beside them, so a rail leaves them out
  expect(host.textContent).not.toContain("Draft");
  expect(host.textContent).not.toContain("Archived");
});

test("as a drawer it shows whole rows, even where the column beside the page is a rail", async () => {
  wide = false;
  await act(async () => root.render(<Sections rail />));

  const open = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Open menu",
  )!;

  expect(open.querySelector('[data-icon="menu"]')).not.toBeNull();
  await act(async () => open.click());

  expect(anchor("#categories").querySelector(".sr-only")).toBeNull();
  expect(anchor("#categories").textContent).toBe("CategoriesDraft");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Archived");
});

test("a row keeps room for its words in semibold, so becoming current never re-wraps it", async () => {
  await render();

  const words = (name: string) => link(name).querySelector<HTMLElement>("[data-words]")!;

  // Its words' semibold copy shares their cell, unseen and unread
  expect(words("Fees").dataset.words).toBe("Fees");
  expect(words("Fees").className).toContain("after:content-[attr(data-words)]");
  expect(words("Fees").className).toContain("after:font-semibold");
  expect(words("Fees").className).toContain("after:invisible");
  expect(link("Fees").textContent).toBe("Fees");
});

test("beside the page, the column eases away rather than moving the page in one frame", async () => {
  // As it first shows, it's simply there
  expect(renderToStaticMarkup(<Service />)).not.toContain("starting:w-0");
  await render();

  const column = nav()!;

  expect(column.className).toContain("transition-[width,display]");
  expect(column.className).toContain("[&[hidden]]:w-0");
  expect(column.className).toContain("motion-reduce:transition-none");
  // Shown again later, it opens out from nothing
  expect(column.className).toContain("starting:w-0");
  // Its content keeps the column's width as it narrows, so nothing in it re-wraps
  expect(column.firstElementChild?.className).toContain("w-60");
});

test("while a group's rows load, a line says so once, with the turning circle", async () => {
  await act(async () =>
    root.render(
      <Sidebar.Root
        sidebar={{ id: "pages", wide: true, open: true, setOpen: () => {} }}
        label="Pages"
      >
        <Sidebar.Content>
          <Sidebar.Loading>Loading pages…</Sidebar.Loading>
        </Sidebar.Content>
      </Sidebar.Root>,
    ),
  );

  const line = host.querySelector('[role="status"]')!;

  expect(line.textContent).toBe("Loading pages…");
  expect(line.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  // Not an empty state's tray
  expect(line.querySelector(".motion-safe\\:animate-spin")).not.toBeNull();
});
