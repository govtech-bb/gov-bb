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
import { createEditorApi, type ApiPage, type PageHistoryEntry } from "../../src/api/client";
import { Toaster } from "../../src/ui/toast";
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
  let currentPage: ApiPage = {
    id: PAGE,
    slug: "severance-pay",
    url: "/severance-pay",
    title: "Severance pay",
    description: null,
    category_id: null,
    parent_id: null,
    form_id: null,
    visibility: visibility === "public" ? "public" : "draft",
    body_markdown: "",
    frontmatter: {},
    published_at: null,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-28T14:00:00.000Z",
    version: READ,
    last_edited_by: null,
    pending_revision: null,
  };

  restored = Response.json(currentPage);
  restores = [];
  let restoreReply = async () => restored.clone();

  let historyReply = async () =>
    entries ? Response.json({ entries }) : Response.json({ error: "not_found" }, { status: 404 });

  let historyReads = 0;
  let pageReads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;

      if (path === `/pages/${PAGE}`) {
        pageReads += 1;

        return Response.json(currentPage);
      }

      if (path === "/editor/me") return Response.json({ roles });

      if (path.endsWith("/restore")) {
        restores.push({ url: path, init });

        return restoreReply();
      }

      if (path === `/pages/${PAGE}/history`) {
        historyReads += 1;

        return historyReply();
      }

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

  const api = createEditorApi("https://api.example.test");
  await act(() => router.load());

  const rerender = () =>
    act(async () =>
      root.render(
        <RouterContextProvider router={router}>
          <QueryClientProvider client={client}>
            <HistoryScreen api={api} pageId={PAGE} serviceId="service-1" />
            <Toaster />
          </QueryClientProvider>
        </RouterContextProvider>,
      ),
    );

  await rerender();

  return {
    api,
    rerender,
    page: (next: Partial<ApiPage>) => {
      currentPage = { ...currentPage, ...next };
    },
    entries: (next: PageHistoryEntry[]) => {
      entries = next;
    },
    answer: (next: () => Promise<Response>) => {
      restoreReply = next;
    },
    history: (next: () => Promise<Response>) => {
      historyReply = next;
    },
    reads: () => ({ history: historyReads, page: pageReads }),
  };
}

const until = (ready: () => void) => act(async () => vi.waitFor(ready));

const items = () => [...host.querySelectorAll("li")].map((item) => item.textContent);

test("a page with no history says so, rather than that it failed to load", async () => {
  await render(null);

  await until(() => expect(host.textContent).toContain("No history yet"));
  expect(host.textContent).not.toContain("We could not load");
});

test("a failed history refresh keeps the last loaded entries with a retry notice", async () => {
  await render([entry({ version_no: 2 }), entry({ action: "created" })]);
  await until(() => expect(items()).toHaveLength(2));

  const fetch = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 503 })),
  );
  await act(async () => {
    await client.refetchQueries({ queryKey: ["content", "history", PAGE] });
  });
  await until(() =>
    expect(host.textContent).toContain(
      "We could not refresh this page’s history. Showing the last loaded list.",
    ),
  );
  expect(items()).toHaveLength(2);
  expect(items()[0]).toContain("Edited by Ada Editor");
  expect(host.textContent).not.toContain("We could not load this page’s history");

  vi.stubGlobal("fetch", fetch);
  await act(async () => buttons("Try again")[0]?.click());
  await until(() =>
    expect(host.textContent).not.toContain("We could not refresh this page’s history"),
  );
  expect(items()).toHaveLength(2);
  expect(restores).toEqual([]);
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

const uncertainty =
  "We couldn’t tell whether that went through. Check your connection, then check again before you try again.";

const dialog = () => document.querySelector('[role="alertdialog"]');

const restoredTitles = () =>
  [...document.querySelectorAll("*")].filter(
    (node) => node.children.length === 0 && node.textContent === "Version restored",
  );

async function openRestore(index = 0) {
  await until(() => expect(buttons("Restore this version")).toHaveLength(2));
  await act(async () => buttons("Restore this version")[index]!.click());
  await until(() => expect(dialog()).not.toBeNull());
}

function watchRestoreNotices() {
  const notices: string[] = [];

  const check = (text: string | null) => {
    if (
      text &&
      /couldn.t be restored|couldn’t tell|We could not refresh|Another|deleted since/.test(text)
    )
      notices.push(text);
  };

  const observer = new MutationObserver((changes) => {
    check(document.body.textContent);

    for (const change of changes) {
      if (change.type === "characterData") check(change.target.textContent);

      for (const node of [...change.addedNodes, ...change.removedNodes]) check(node.textContent);
    }
  });

  observer.observe(document.body, { subtree: true, childList: true, characterData: true });

  return { notices, stop: () => observer.disconnect() };
}

test.each([
  ["draft", null, "It's saved as a new change at the top of the history."],
  ["public", "submitted", "It's saved in the change that is waiting for review."],
  ["public", "draft", "It's saved as a change to this page. Submit it for review to publish it."],
] as const)(
  "ordinary restore keeps the pressed %s/%s description across refetches",
  async (visibility, status, description) => {
    const server = await render(VERSIONS, { roles: ["editor"], visibility });

    if (status) {
      server.page({ pending_revision: { status, comment: null } });
      await act(async () => client.invalidateQueries({ queryKey: ["content"] }));
    }

    await openRestore();
    const sent = Promise.withResolvers<Response>();
    server.answer(() => sent.promise);
    const wording = dialog()!.textContent!;
    const observing = watchRestoreNotices();
    await act(async () => {
      buttons("Restore version")[0]!.click();
      buttons("Restore version")[0]?.click();
    });
    await until(() => expect(restores).toHaveLength(1));
    server.page({
      visibility: visibility === "public" ? "draft" : "public",
      version: 99,
      pending_revision: null,
    });
    server.entries([entry({ version_no: 5, action: "reverted", restored_from: 2 }), ...VERSIONS]);
    await act(async () => client.invalidateQueries({ queryKey: ["content"] }));
    await server.rerender();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain(
      visibility === "public" ? "Citizens keep seeing" : "Who can see the page doesn't change.",
    );
    expect(wording).toContain(
      visibility === "public" ? "Citizens keep seeing" : "Who can see the page doesn't change.",
    );
    expect(restoredTitles()).toHaveLength(0);
    await act(async () =>
      dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(dialog()).not.toBeNull();
    await act(async () => sent.resolve(restored.clone()));
    await until(() => expect(dialog()).toBeNull());
    expect(document.body.textContent).toContain(description);
    expect(restoredTitles()).toHaveLength(1);
    await act(async () => client.invalidateQueries({ queryKey: ["content"] }));
    await server.rerender();
    expect(restoredTitles()).toHaveLength(1);
    expect(restores).toHaveLength(1);
    expect(observing.notices).toEqual([]);
    observing.stop();
  },
);

test("a lost restore confirms from independent history while its own queries run ahead", async () => {
  const server = await render(VERSIONS, { roles: ["editor"] });
  await openRestore();
  const restoredEntry = entry({ version_no: 5, action: "reverted", restored_from: 2 });
  const proof = Promise.withResolvers<Response>();
  let reads = 0;
  server.answer(async () => new Response(null, { status: 503 }));
  server.history(async () =>
    ++reads === 2 ? proof.promise : Response.json({ entries: [restoredEntry, ...VERSIONS] }),
  );
  server.page({ version: 99, visibility: "public" });
  const observing = watchRestoreNotices();
  await act(async () => buttons("Restore version")[0]!.click());
  await until(() => expect(reads).toBe(2));
  await until(() => expect(items()).toHaveLength(5));
  await server.rerender();
  expect(dialog()).not.toBeNull();
  expect(dialog()!.textContent).toContain("Who can see the page doesn't change.");
  expect(buttons("Restoring…")).toHaveLength(1);
  expect(restoredTitles()).toHaveLength(0);
  await act(async () => proof.resolve(Response.json({ entries: [restoredEntry, ...VERSIONS] })));
  await until(() => expect(dialog()).toBeNull());
  expect(document.body.textContent).toContain(
    "It's saved as a new change at the top of the history.",
  );
  expect(restoredTitles()).toHaveLength(1);
  await server.rerender();
  expect(restoredTitles()).toHaveLength(1);
  expect(restores).toHaveLength(1);
  expect(observing.notices).toEqual([]);
  observing.stop();
});

test("the first press captures the newest displayed history boundary and page version, not the opening's", async () => {
  const server = await render(VERSIONS, { roles: ["editor"] });
  await openRestore();
  server.page({ version: 9 });
  server.entries([entry({ version_no: 8, action: "reverted", restored_from: 2 }), ...VERSIONS]);
  await act(async () => client.invalidateQueries({ queryKey: ["content"] }));
  await server.rerender();
  server.answer(async () => new Response(null, { status: 503 }));
  await act(async () => buttons("Restore version")[0]!.click());
  await until(() => expect(dialog()!.textContent).toContain(uncertainty));
  expect(JSON.parse(String(restores[0]!.init!.body))).toEqual({ expected_version: 9 });
  expect(restoredTitles()).toHaveLength(0);
});

test.each(["draft", "public"] as const)(
  "an unconfirmed %s restore resends the frozen version after background refresh",
  async (visibility) => {
    const server = await render(VERSIONS, { roles: ["editor"], visibility });
    await openRestore();
    server.answer(async () => new Response(null, { status: 503 }));
    await act(async () => buttons("Restore version")[0]!.click());
    await until(() => expect(dialog()!.textContent).toContain(uncertainty));
    expect(buttons("Check again")).toHaveLength(1);
    expect(restores).toHaveLength(1);
    expect(restoredTitles()).toHaveLength(0);
    server.page({ version: 99, visibility: visibility === "public" ? "draft" : "public" });
    server.entries([entry({ version_no: 100, action: "updated" }), ...VERSIONS]);
    await act(async () => client.invalidateQueries({ queryKey: ["content"] }));
    await server.rerender();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain(
      visibility === "public" ? "Citizens keep seeing" : "Who can see the page doesn't change.",
    );
    server.answer(async () =>
      Response.json(
        { error: "version_conflict", message: "The page changed since you opened it." },
        { status: 409 },
      ),
    );
    await act(async () => buttons("Check again")[0]!.click());
    await until(() =>
      expect(dialog()!.textContent).toContain("The page changed since you opened it."),
    );
    expect(restores.map(({ url, init }) => [url, JSON.parse(String(init!.body))])).toEqual([
      [`/pages/${PAGE}/history/2/restore`, { expected_version: READ }],
      [`/pages/${PAGE}/history/2/restore`, { expected_version: READ }],
    ]);
    expect(restoredTitles()).toHaveLength(0);
  },
);

test("closing an unknown restore of A and opening B cannot resend A", async () => {
  const server = await render(VERSIONS, { roles: ["editor"] });
  await openRestore(0);
  server.answer(async () => new Response(null, { status: 503 }));
  await act(async () => buttons("Restore version")[0]!.click());
  await until(() => expect(dialog()!.textContent).toContain(uncertainty));
  await act(async () => buttons("Cancel")[0]!.click());
  await until(() => expect(dialog()).toBeNull());
  await openRestore(1);
  expect(dialog()!.textContent).not.toContain(uncertainty);
  expect(buttons("Restore version")).toHaveLength(1);
  server.answer(async () => restored.clone());
  await act(async () => buttons("Restore version")[0]!.click());
  await until(() => expect(dialog()).toBeNull());
  expect(restores.map(({ url }) => url)).toEqual([
    `/pages/${PAGE}/history/2/restore`,
    `/pages/${PAGE}/history/1/restore`,
  ]);
  expect(restoredTitles()).toHaveLength(1);
});

test.each([
  [400, "bad_request", "The request was not accepted."],
  [401, "signed_out", "Sign in first."],
  [403, "forbidden", "You need the editor role."],
  [404, "version_not_found", "This page has no version 2 in its history."],
  [409, "not_restorable", "Version 2 was removed from the history."],
  [409, "version_conflict", "This page changed."],
  [409, "not_restorable", undefined],
  [422, "validation_failed", "The earlier path is taken."],
] as const)(
  "restore keeps the %s/%s refusal and only refreshes on 409",
  async (status, error, message) => {
    const server = await render(VERSIONS, { roles: ["editor"] });
    await openRestore();
    const reads = server.reads();
    server.answer(async () => Response.json({ error, message }, { status }));
    await act(async () => buttons("Restore version")[0]!.click());
    await until(() =>
      expect(dialog()!.textContent).toContain(
        message ?? "The version couldn't be restored. Try again.",
      ),
    );
    expect(restoredTitles()).toHaveLength(0);

    if (status === 409) {
      await until(() => expect(server.reads().history).toBe(reads.history + 1));
      expect(server.reads().page).toBe(reads.page + 1);
    } else {
      expect(server.reads()).toEqual(reads);
    }
  },
);
