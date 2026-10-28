/** @vitest-environment jsdom */
import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { shownText } from "../../tests/helpers/shown-text";
import { ListScreen } from "./list-screen";
import { RefreshFailure } from "./refresh-failure";

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

const card = () => host.querySelector<HTMLElement>(".\\@container")!;

test("its header, then a card holding the filters, a status line and the table", async () => {
  const ref = createRef<HTMLDivElement>();

  await render(
    <ListScreen
      ref={ref}
      title="Services"
      lead="Each service has an entry page."
      action={<button type="button">Create service</button>}
      filters={<div role="search">Filters</div>}
      status="Loading services…"
    >
      <table aria-label="Services" />
    </ListScreen>,
  );

  expect(host.querySelector("h1")?.textContent).toBe("Services");
  expect(ref.current).toBe(card());
  expect([...card().children].map((part) => part.getAttribute("role") ?? part.tagName)).toEqual([
    "search",
    "status",
    "TABLE",
  ]);
  expect(card().querySelector('[role="status"]')?.textContent).toBe("Loading services…");
  // Inset as the bars are, so its title lines up with the header's first control
  expect(host.firstElementChild?.className).toContain("px-4 py-10 sm:px-6");
});

test("an old list shows under a strip that offers to try again; one that never came shows why instead", async () => {
  const retry = vi.fn();

  await render(
    <ListScreen
      title="Categories"
      refreshFailure={
        <RefreshFailure inset="card" pending={false} onRetry={retry}>
          We could not refresh categories. Showing the last loaded list.
        </RefreshFailure>
      }
    >
      <table aria-label="Categories" />
    </ListScreen>,
  );

  const strip = card().querySelector('[role="status"] + div')!;

  expect(strip.textContent).toContain("We could not refresh categories.");
  // Lined up with the card's rows
  expect(strip.className).toContain("px-4");
  expect(strip.className).not.toContain("sm:px-6");
  await act(async () => strip.querySelector("button")!.click());
  expect(retry).toHaveBeenCalledOnce();
  expect(card().querySelector("table")).not.toBeNull();

  await render(
    <ListScreen title="Categories" failure={<p>We could not load categories</p>}>
      <table aria-label="Categories" />
    </ListScreen>,
  );
  expect(card().querySelector("table")).toBeNull();
  expect(card().textContent).toBe("We could not load categories");
});

test("trying again, its button turns and says so, keeping its place", async () => {
  await render(
    <RefreshFailure pending pendingLabel="Refreshing services…" onRetry={() => {}}>
      We could not refresh services.
    </RefreshFailure>,
  );

  const button = host.querySelector("button")!;

  expect(shownText(button)).toBe("Refreshing services…");
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(host.firstElementChild?.className).toContain("bg-yellow-20");
});
