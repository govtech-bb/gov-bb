/** @vitest-environment jsdom */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PageActions } from "../../src/workspace/page-actions";

const rootRoute = createRootRoute();

const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/history/$pageId" }),
  ]),
  history: createMemoryHistory({ initialEntries: ["/services/service/fees"] }),
});

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

const render = (props: Partial<ComponentProps<typeof PageActions>>) =>
  act(async () =>
    root.render(
      <RouterContextProvider router={router}>
        <PageActions
          pageId="fees"
          serviceId="service"
          entry={false}
          onDelete={() => {}}
          {...props}
        />
      </RouterContextProvider>,
    ),
  );

// The menu renders in a portal outside the root
async function open() {
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="More page actions"]')!.click(),
  );
}

const row = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.startsWith(name),
  )!;

test("the page's history opens from its menu, with its service to come back to", async () => {
  await render({});
  await open();

  expect(row("Page history").getAttribute("href")).toBe("/history/fees?service=service");
});

test("Delete says why it can't run yet under it, instead of failing after the author confirms", async () => {
  const onDelete = vi.fn();

  await render({ deleteBlocked: "Delete or move the pages under this page first.", onDelete });
  await open();

  expect(row("Delete page…").getAttribute("aria-disabled")).toBe("true");
  expect(
    document.getElementById(row("Delete page…").getAttribute("aria-describedby")!)?.textContent,
  ).toBe("Delete or move the pages under this page first.");
  await act(async () => row("Delete page…").click());
  expect(onDelete).not.toHaveBeenCalled();
});

test("a page that can go is deleted from its menu, and the entry page's Delete names the service", async () => {
  const onDelete = vi.fn();

  await render({ onDelete });
  await open();

  expect(row("Delete page…").hasAttribute("aria-describedby")).toBe(false);
  await act(async () => row("Delete page…").click());
  expect(onDelete).toHaveBeenCalledOnce();

  await render({ entry: true, onDelete });
  await open();
  expect(row("Delete service…")).toBeDefined();
});
