/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createEditorApi, type PageHistoryEntry } from "../../src/api/client";
import { HistoryScreen } from "../../src/workspace/history-screen";

const PAGE = "44444444-4444-4444-8444-444444444444";

const entry = (overrides: Partial<PageHistoryEntry>): PageHistoryEntry => ({
  version_no: 1,
  action: "updated",
  actor: "editor-1",
  actor_name: "Ada Editor",
  occurred_at: "2026-10-28T11:00:00.000Z",
  changed: [],
  comment: null,
  ...overrides,
});

let host: HTMLDivElement;

let root: Root;

let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.unstubAllGlobals();
});

/** The history screen over a content API answering with `entries`, or a 404 when there are none. */
async function render(entries: PageHistoryEntry[] | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;

      if (path === `/pages/${PAGE}`) return Response.json({ id: PAGE, title: "Severance pay" });

      if (path === `/pages/${PAGE}/history` && entries) return Response.json({ entries });

      return Response.json({ error: "not_found" }, { status: 404 });
    }),
  );

  const rootRoute = createRootRoute();

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/history/$pageId" }),
      createRoute({ getParentRoute: () => rootRoute, path: "/services/$serviceId/$documentId" }),
    ]),
    history: createMemoryHistory({ initialEntries: [`/history/${PAGE}`] }),
  });

  await act(() => router.load());
  await act(async () =>
    root.render(
      <RouterContextProvider router={router}>
        <QueryClientProvider client={client}>
          <HistoryScreen
            api={createEditorApi("https://api.example.test")}
            pageId={PAGE}
            serviceId="service-1"
          />
        </QueryClientProvider>
      </RouterContextProvider>,
    ),
  );
}

const until = (ready: () => void) => act(async () => vi.waitFor(ready));

const items = () => [...host.querySelectorAll("li")].map((item) => item.textContent);

test("a page with no history says so, rather than that it failed to load", async () => {
  await render(null);

  await until(() => expect(host.textContent).toContain("No history yet"));
  expect(host.textContent).not.toContain("We could not load");
});

test("each entry says who did it: their name, the system, or a former employee", async () => {
  await render([
    entry({ version_no: 3, actor_name: "Ada Editor" }),
    entry({ version_no: 2, actor: "system", actor_name: "System", action: "created" }),
    entry({ version_no: 1, actor: "gone-1", actor_name: null }),
  ]);

  await until(() => expect(items()).toHaveLength(3));
  expect(items().map((item) => item?.match(/^(.*?)\d/)?.[1])).toEqual([
    "Edited by Ada Editor",
    "Created by the system",
    "Edited by a former employee",
  ]);
});

test("an entry names the fields it changed, and a rejection its reason", async () => {
  await render([
    entry({ version_no: 2, action: "rejected", comment: "The fee is wrong." }),
    entry({ version_no: 1, changed: ["title", "body_markdown"] }),
  ]);

  await until(() => expect(items()).toHaveLength(2));
  expect(items()[0]).toContain("Reason: The fee is wrong.");
  expect(items()[0]).not.toContain("Changed:");
  expect(items()[1]).toContain("Changed: Title, Content");
  expect(items()[1]).not.toContain("Reason:");
});

test("the live write an approval let through reads as publishing it, not as the approver's edit", async () => {
  const approver = { actor: "approver-1", actor_name: "Ben Approver" };
  const approvedAt = "2026-10-28T12:00:00.000Z";

  await render([
    entry({ version_no: 5, ...approver, occurred_at: "2026-10-28T13:00:00.000Z", changed: ["title"] }),
    entry({ version_no: 4, ...approver, occurred_at: approvedAt, changed: ["title", "body_markdown"] }),
    entry({ version_no: 3, ...approver, action: "approved", occurred_at: approvedAt }),
    entry({ version_no: 2, action: "submitted" }),
    entry({ version_no: 1, action: "created" }),
  ]);

  await until(() => expect(items()).toHaveLength(5));
  expect(items().map((item) => item?.match(/^(.*?)\d/)?.[1])).toEqual([
    "Edited by Ben Approver",
    "Approved change published by Ben Approver",
    "Approved and published by Ben Approver",
    "Submitted for review by Ada Editor",
    "Created by Ada Editor",
  ]);
  expect(items()[1]).toContain("Changed: Title, Content");
});

test("a long rejection reason wraps rather than running out of its entry", async () => {
  await render([entry({ action: "rejected", comment: "https://example.test/".repeat(20) })]);

  await until(() => expect(items()).toHaveLength(1));

  const reason = [...host.querySelectorAll("li span")].find((span) =>
    span.textContent?.startsWith("Reason:"),
  );

  expect(reason?.classList).toContain("wrap-break-word");
});

test("Back to the page goes to the page in the service it was opened from", async () => {
  await render([entry({})]);

  const back = [...host.querySelectorAll("a")].find(
    (link) => link.textContent === "Back to the page",
  );

  expect(back?.getAttribute("href")).toBe(`/services/service-1/${PAGE}`);
});
