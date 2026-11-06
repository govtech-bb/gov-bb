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
import { shownText } from "../helpers/shown-text";

const PAGE = "44444444-4444-4444-8444-444444444444";

const entry = (overrides: Partial<PageHistoryEntry>): PageHistoryEntry => ({
  version_no: 1,
  action: "updated",
  actor: "editor-1",
  actor_name: "Ada Editor",
  occurred_at: "2026-10-28T11:00:00.000Z",
  changed: [],
  comment: null,
  restored_from: null,
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

/** The page's version, as the restore must name it. */
const READ = 7;

/** What the restore route answers, and every request that reached it. */
let restored: Response;

let restores: { url: string; init: RequestInit | undefined }[];

/**
 * The history screen over a content API answering with `entries`, or a 404 when there are none, to an employee
 * holding `roles`, about a page that is `visibility`.
 */
async function render(
  entries: PageHistoryEntry[] | null,
  { roles = [], visibility = "draft" }: { roles?: string[]; visibility?: string } = {},
) {
  restored = Response.json({ id: PAGE });
  restores = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;

      if (path === `/pages/${PAGE}`)
        return Response.json({
          id: PAGE,
          slug: "severance-pay",
          url: "/severance-pay",
          title: "Severance pay",
          description: null,
          category_id: null,
          parent_id: null,
          form_id: null,
          visibility,
          body_markdown: "",
          frontmatter: {},
          published_at: null,
          created_at: "2026-10-01T12:00:00.000Z",
          updated_at: "2026-10-28T14:00:00.000Z",
          version: READ,
          last_edited_by: null,
          pending_revision: null,
        });

      if (path === "/editor/me") return Response.json({ roles });

      if (path.endsWith("/restore")) {
        restores.push({ url: path, init });

        return restored;
      }

      if (path === `/pages/${PAGE}/history` && entries) return Response.json({ entries });

      return Response.json({ error: "not_found" }, { status: 404 });
    }),
  );

  const rootRoute = createRootRoute();

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/history/$pageId",
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/services/$serviceId/$documentId",
      }),
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
    entry({
      version_no: 2,
      actor: "system",
      actor_name: "System",
      action: "created",
    }),
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
    entry({
      version_no: 5,
      ...approver,
      occurred_at: "2026-10-28T13:00:00.000Z",
      changed: ["title"],
    }),
    entry({
      version_no: 4,
      ...approver,
      occurred_at: approvedAt,
      changed: ["title", "body_markdown"],
    }),
    entry({
      version_no: 3,
      ...approver,
      action: "approved",
      occurred_at: approvedAt,
    }),
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

test("a long history shows its latest 50 changes, then older ones 50 at a time", async () => {
  const approver = { actor: "approver-1", actor_name: "Ben Approver" };
  const approvedAt = "2026-10-28T12:00:00.000Z";
  const entries = Array.from({ length: 120 }, (_, index) => entry({ version_no: 120 - index }));

  // The 50th, the last shown at first, is the write an approval let through; its approval is the 51st
  entries[49] = entry({ version_no: 71, ...approver, occurred_at: approvedAt });
  entries[50] = entry({
    version_no: 70,
    ...approver,
    action: "approved",
    occurred_at: approvedAt,
  });
  await render(entries);

  const older = () =>
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Show older changes",
    );

  await until(() => expect(items()).toHaveLength(50));
  expect(items()[49]).toMatch(/^Approved change published by Ben Approver/);

  await act(async () => older()?.click());
  expect(items()).toHaveLength(100);
  // The first change it added takes the focus
  expect(document.activeElement).toBe(host.querySelectorAll("li")[50]);

  await act(async () => older()?.click());
  expect(items()).toHaveLength(120);
  expect(older()).toBeUndefined();
  expect(document.activeElement).toBe(host.querySelectorAll("li")[100]);
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

const buttons = (label: string) =>
  [...document.querySelectorAll("button")].filter((button) => shownText(button) === label);

const VERSIONS = [
  entry({ version_no: 4, action: "updated", changed: ["title"] }),
  entry({ version_no: 3, action: "submitted" }),
  entry({ version_no: 2, action: "updated", changed: ["body_markdown"] }),
  entry({ version_no: 1, action: "created" }),
];

test("an editor can restore any earlier version of the page, but not a review step or the current version", async () => {
  await render(VERSIONS, { roles: ["editor"] });

  await until(() => expect(buttons("Restore this version")).toHaveLength(2));

  const offered = [...host.querySelectorAll("li")].map((item) =>
    item.textContent?.includes("Restore this version"),
  );

  expect(offered).toEqual([false, false, true, true]);
});

test("an employee without the editor role isn't offered a restore", async () => {
  await render(VERSIONS);

  await until(() => expect(items()).toHaveLength(4));
  expect(buttons("Restore this version")).toEqual([]);
});

test("restoring confirms first, then sends the version and the page's version it was read at", async () => {
  await render(VERSIONS, { roles: ["editor"] });
  await until(() => expect(buttons("Restore this version")).toHaveLength(2));

  await act(async () => buttons("Restore this version")[1]?.click());
  await until(() => expect(document.body.textContent).toContain("Restore this version?"));
  expect(document.body.textContent).toContain("nothing is removed");
  expect(restores).toEqual([]);

  await act(async () => buttons("Restore version")[0]?.click());
  await until(() => expect(restores).toHaveLength(1));
  expect(restores[0]?.url).toBe(`/pages/${PAGE}/history/1/restore`);
  expect(restores[0]?.init?.method).toBe("POST");
  expect(JSON.parse(String(restores[0]?.init?.body))).toEqual({ expected_version: READ });
});

test("on a public page, the dialog says the restore waits for review", async () => {
  await render(VERSIONS, { roles: ["editor"], visibility: "public" });
  await until(() => expect(buttons("Restore this version")).toHaveLength(2));

  await act(async () => buttons("Restore this version")[0]?.click());

  await until(() =>
    expect(document.body.textContent).toContain(
      "Citizens keep seeing the live page until an approver publishes the change.",
    ),
  );
});

test("a refused restore says why in the dialog, which stays open", async () => {
  await render(VERSIONS, { roles: ["editor"] });
  await until(() => expect(buttons("Restore this version")).toHaveLength(2));
  restored = Response.json(
    {
      error: "not_restorable",
      message: "Version 1 was removed from the history.",
    },
    { status: 409 },
  );

  await act(async () => buttons("Restore this version")[1]?.click());
  await act(async () => buttons("Restore version")[0]?.click());

  await until(() =>
    expect(document.body.textContent).toContain("Version 1 was removed from the history."),
  );
  expect(document.body.textContent).toContain("Restore this version?");
});

test("a restore reads as restoring the version from its date", async () => {
  await render([
    entry({
      version_no: 2,
      action: "reverted",
      restored_from: 1,
      changed: ["title"],
    }),
    entry({
      version_no: 1,
      action: "created",
      occurred_at: "2026-10-27T09:30:00.000Z",
    }),
  ]);

  await until(() => expect(items()).toHaveLength(2));
  expect(items()[0]).toMatch(/^Restored the version from .+ by Ada Editor/);
});
