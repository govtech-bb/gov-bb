/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi, type ApiPage } from "../../src/api/client";
import { RemotePagePane } from "../../src/workspace/remote-page-pane";
import { renderInPage } from "../helpers/page-editor";

const page: ApiPage = {
  id: "page-1",
  url: "/travel-id-citizenship/renew-a-passport",
  slug: "renew-a-passport",
  category_id: null,
  parent_id: "entry-1",
  title: "Renew a passport",
  description: null,
  visibility: "public",
  form_id: null,
  body_markdown: "Bring your old passport.",
  frontmatter: {},
  published_at: null,
  created_at: "2026-10-07T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
};

afterEach(() => window.localStorage.clear());

/** Lets the page's queries settle until it's open. */
async function until(ready: () => boolean) {
  for (let tries = 0; !ready() && tries < 50; tries++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

test("a page that can't be left yet says so among its own notices, under its bar", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("scrollTo", () => {});
  vi.stubGlobal("fetch", async (url: string) =>
    Response.json(
      url.endsWith("/taxonomy") ? { categories: [] } : url.endsWith("/services") ? [] : page,
    ),
  );

  const api = createEditorApi("http://localhost:3020");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();

  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: "/page",
        component: () => <RemotePagePane api={api} id={page.id} active onStore={() => {}} />,
      }),
      createRoute({ getParentRoute: () => root, path: "/services" }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/page"] }),
    Wrap: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });

  await renderInPage(<RouterProvider router={router} />);
  await until(() => !!document.querySelector('textarea[aria-label="Page title"]'));

  // The title changes as the browser's storage fills, so the change can't be kept before leaving
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage full", "QuotaExceededError");
  });

  const title = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Page title"]')!;

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      title,
      "Renew a Barbados passport",
    );
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // A blocked navigation never settles, so it isn't awaited
  await act(async () => {
    void router.navigate({ to: "/services" });
  });
  await until(() => !!document.body.textContent?.includes("before leaving it"));

  const bar = document.querySelector('[role="toolbar"][aria-label="Page tools"]')!;

  expect(router.state.location.pathname).toBe("/page");
  expect(bar.previousElementSibling).toBeNull();
  expect(bar.nextElementSibling?.textContent).toContain(
    "Save or download this draft before leaving it.",
  );
});
