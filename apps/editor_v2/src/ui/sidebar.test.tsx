/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
