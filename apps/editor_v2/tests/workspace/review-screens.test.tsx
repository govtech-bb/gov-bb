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
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from "vitest";
import {
  createEditorApi,
  type ApiPage,
  type ApiRevision,
  type ReviewQueueEntry,
} from "../../src/api/client";
import { Toaster } from "../../src/ui/toast";
import { ReviewQueueScreen, ReviewScreen } from "../../src/workspace/review-screens";

const PAGE = "44444444-4444-4444-8444-444444444444";

const VERSION = "2026-10-28T12:00:00.000Z";

const entry: ReviewQueueEntry = {
  id: "55555555-5555-4555-8555-555555555555",
  page_id: PAGE,
  title: "Severance pay",
  url: "/money/severance-pay",
  submitted_by: "editor-1",
  submitted_by_name: "Ada Editor",
  submitted_at: "2026-10-28T11:00:00.000Z",
  updated_at: VERSION,
};

const revision: ApiRevision = {
  version: 1,
  id: entry.id,
  page_id: PAGE,
  status: "submitted",
  fields: {
    url: entry.url,
    category_id: null,
    parent_id: null,
    title: "Severance pay",
    description: null,
    visibility: "public",
    form_id: null,
    body_markdown: "Intro\n\n## Costs",
    frontmatter: {},
  },
  live_updated_at: "2026-10-27T12:00:00.000Z",
  created_by: "editor-1",
  contributors: ["editor-1"],
  submitted_by: "editor-1",
  submitted_at: entry.submitted_at,
  decided_by: null,
  decided_at: null,
  comment: null,
  created_at: "2026-10-28T10:00:00.000Z",
  updated_at: VERSION,
  changes: [
    { field: "title", live: "Calculate severance pay", proposed: "Severance pay" },
    { field: "body_markdown", live: "Intro\n\n## Fees", proposed: "Intro\n\n## Costs" },
  ],
};

const publishedPage: ApiPage = {
  ...revision.fields,
  id: PAGE,
  slug: "severance-pay",
  version: 2,
  created_at: VERSION,
  updated_at: VERSION,
  published_at: VERSION,
  pending_revision: null,
  last_edited_by: null,
};

const rejected: ApiRevision = {
  ...revision,
  version: 2,
  status: "rejected",
  comment: "Check the fees.",
  decided_by: "me",
  decided_at: VERSION,
};

type Sent = { method: string; path: string; body: unknown };

/** The content API's review routes; `decision` answers a publish or reject. */
function contentApi(
  roles: string[],
  body?: string,
  paths: () => Promise<Response> = async () => Response.json(["/money/severance-pay"]),
) {
  const sent: Sent[] = [];

  let current: ApiRevision | null = body
    ? { ...revision, fields: { ...revision.fields, body_markdown: body } }
    : revision;

  let decision: () => Response | Promise<Response> = () => Response.json({});

  let revisionRead: () => Response | Promise<Response> = () =>
    current ? Response.json(current) : Response.json({ error: "not_found" }, { status: 404 });

  let pageRead: () => Response | Promise<Response> = () =>
    Response.json({ error: "not_found" }, { status: 404 });

  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname + new URL(url).search;
    const method = init?.method ?? "GET";

    if (method === "POST") {
      sent.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

      return decision();
    }

    if (path === "/editor/me")
      return Response.json({ id: "me", email: "me@govtech.bb", name: "Me", roles });

    if (path === "/editor/page-paths") return paths();

    if (path === "/editor/categories") return Response.json({ categories: [] });

    if (path === "/revisions?status=submitted")
      return Response.json({ revisions: current?.status === "submitted" ? [entry] : [] });

    if (path === `/pages/${PAGE}/revision`) return revisionRead();

    if (path === `/pages/${PAGE}`) return pageRead();

    return Response.json({ error: "not_found" }, { status: 404 });
  });

  return {
    fetch,
    sent,
    answer: (next: () => Response | Promise<Response>) => void (decision = next),
    revisionRead: (next: () => Response | Promise<Response>) => void (revisionRead = next),
    pageRead: (next: () => Response | Promise<Response>) => void (pageRead = next),
    replace: (next: ApiRevision | null) => void (current = next),
    reads: () =>
      fetch.mock.calls.filter(([url]) => String(url).endsWith(`/pages/${PAGE}/revision`)),
  };
}

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

async function render(
  screen: "queue" | "review",
  roles = ["editor", "approver"],
  body?: string,
  paths?: () => Promise<Response>,
) {
  const server = contentApi(roles, body, paths);
  vi.stubGlobal("fetch", server.fetch);
  const rootRoute = createRootRoute();

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/reviews" }),
      createRoute({ getParentRoute: () => rootRoute, path: "/reviews/$pageId" }),
    ]),
    history: createMemoryHistory({
      initialEntries: [screen === "queue" ? "/reviews" : `/reviews/${PAGE}`],
    }),
  });

  await act(() => router.load());
  const api = createEditorApi("https://api.example.test");

  const rerender = () =>
    act(async () =>
      root.render(
        <RouterContextProvider router={router}>
          <QueryClientProvider client={client}>
            <main id="workspace-content" tabIndex={-1}>
              {screen === "queue" ? (
                <ReviewQueueScreen api={api} />
              ) : (
                <ReviewScreen api={api} pageId={PAGE} />
              )}
            </main>
            <Toaster />
          </QueryClientProvider>
        </RouterContextProvider>,
      ),
    );

  await rerender();

  return { server, router, rerender };
}

const until = (ready: () => void) => act(async () => vi.waitFor(ready));

const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent === name,
  );

const press = (name: string) => act(async () => button(name)!.click());

const dialog = () =>
  document.querySelector<HTMLElement>(
    '[role="dialog"]:not([data-type]), [role="alertdialog"]:not([data-type])',
  );

const text = () => document.body.textContent ?? "";

function watchDecisionNotices() {
  let announced = false;

  const notice = "Another approver published or rejected this change while you were reviewing it.";

  const watch = new MutationObserver((changes) => {
    announced ||=
      text().includes(notice) ||
      changes.some((change) =>
        [...change.addedNodes, ...change.removedNodes].some((node) =>
          node.textContent?.includes(notice),
        ),
      );
  });

  watch.observe(document.body, { childList: true, subtree: true, characterData: true });
  onTestFinished(() => watch.disconnect());

  return () => expect(announced).toBe(false);
}

const enterComment = (value: string) =>
  act(async () => {
    const field = dialog()!.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      field,
      value,
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

const confirmDecision = () =>
  act(async () => {
    const opened = dialog()!;

    const confirm =
      opened.querySelector<HTMLButtonElement>('button[type="submit"]') ??
      [...opened.querySelectorAll<HTMLButtonElement>("button")].at(-1)!;

    confirm.click();
  });

const shown = () =>
  until(() => expect(host.querySelector("h1")?.textContent).toBe("Severance pay"));

test("the queue lists each change waiting for review, linking to its comparison", async () => {
  await render("queue");

  await until(() => expect(text()).toContain("Submitted by Ada Editor"));
  const link = [...host.querySelectorAll("a")].find((item) => item.textContent === "Severance pay");
  expect(link?.getAttribute("href")).toBe(`/reviews/${PAGE}`);
  expect(text()).toContain(entry.url);
});

test("a failed queue refresh keeps the last loaded changes with a retry notice", async () => {
  const { server } = await render("queue");
  await until(() => expect(text()).toContain("Submitted by Ada Editor"));

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{")),
  );
  await act(async () => {
    await client.refetchQueries({ queryKey: ["content", "review-queue"] });
  });
  await until(() =>
    expect(text()).toContain(
      "We could not refresh the review queue. Showing the last loaded list.",
    ),
  );
  expect(host.querySelector(`a[href="/reviews/${PAGE}"]`)?.textContent).toBe("Severance pay");
  expect(text()).not.toContain("We could not load the review queue");

  const retry = [...host.querySelectorAll("button")].find((item) =>
    item.textContent?.startsWith("Try again"),
  );

  expect(retry).toBeDefined();
  vi.stubGlobal("fetch", server.fetch);
  await act(async () => retry?.click());
  await until(() => expect(text()).not.toContain("We could not refresh the review queue"));
  expect(host.querySelector(`a[href="/reviews/${PAGE}"]`)?.textContent).toBe("Severance pay");
  expect(server.sent).toEqual([]);
});

test("an empty queue says nothing is waiting", async () => {
  const { server } = await render("queue");
  server.replace(null);
  await act(async () => client.invalidateQueries());

  await until(() => expect(text()).toContain("Nothing is waiting for review"));
});

test("the comparison shows each changed field against the live page, in words as well as colour", async () => {
  await render("review");
  await shown();

  expect(text()).toContain("Waiting for review");
  expect(text()).toContain("Calculate severance pay");
  const removed = [...host.querySelectorAll("del")].map((item) => item.textContent);
  const added = [...host.querySelectorAll("ins")].map((item) => item.textContent);
  expect(removed).toContain("Removed: - ## Fees");
  expect(added).toContain("Added: + ## Costs");
});

test("someone who isn't an approver can compare the change but isn't offered a decision", async () => {
  await render("review", ["editor"]);
  await shown();

  expect(button("Approve and publish")).toBeUndefined();
  expect(button("Reject")).toBeUndefined();
  expect(text()).toContain("An approver will publish or reject this change.");
});

test("an approver publishes the change at the version they reviewed, and returns to the queue", async () => {
  const { server, router } = await render("review");
  await shown();
  const noFalseNotice = watchDecisionNotices();
  const lateRead = Promise.withResolvers<Response>();
  server.revisionRead(() => lateRead.promise);
  server.answer(() => {
    server.replace(null);

    return Response.json({
      ...revision.fields,
      id: PAGE,
      slug: "severance-pay",
      version: 2,
      created_at: VERSION,
      updated_at: VERSION,
      published_at: VERSION,
      pending_revision: null,
      last_edited_by: null,
    });
  });

  await press("Approve and publish");
  await until(() => expect(dialog()?.textContent).toContain("Publish this change?"));
  const confirm = [...dialog()!.querySelectorAll("button")].at(-1)!;
  await act(async () => {
    confirm.click();
    confirm.click();
  });

  await until(() => expect(router.state.location.pathname).toBe("/reviews"));
  expect(server.sent).toEqual([
    {
      method: "POST",
      path: `/pages/${PAGE}/revision/publish`,
      body: { expected_version: revision.version },
    },
  ]);
  expect(text()).toContain("Change published");
  // Gone from the queue it returns to
  expect(
    client
      .getQueryData<ReviewQueueEntry[]>(["content", "review-queue"])
      ?.map((item) => item.page_id),
  ).toEqual([]);
  expect(document.activeElement?.id).toBe("workspace-content");
  await act(async () => lateRead.resolve(Response.json({ error: "not_found" }, { status: 404 })));
  noFalseNotice();
});

test("a rejection needs a comment, which goes to the editor with the version reviewed", async () => {
  const { server, router } = await render("review");
  await shown();
  const noFalseNotice = watchDecisionNotices();
  const lateRead = Promise.withResolvers<Response>();
  server.revisionRead(() => lateRead.promise);
  server.answer(() => {
    server.replace(rejected);

    return Response.json(rejected);
  });

  await press("Reject");
  await until(() => expect(dialog()).not.toBeNull());
  const comment = dialog()!.querySelector("textarea")!;
  // The dialog opens on its one field, so the keyboard can start typing
  await until(() => expect(document.activeElement).toBe(comment));

  await act(async () => {
    const send = dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    send.focus();
    send.click();
  });
  expect(dialog()?.textContent).toContain("Enter why you're rejecting this change");
  // Back on the field, which the error describes
  expect(document.activeElement).toBe(comment);
  expect(
    comment
      .getAttribute("aria-describedby")
      ?.split(" ")
      .map((id) => document.getElementById(id)?.textContent),
  ).toContain("Enter why you're rejecting this change");
  expect(server.sent).toEqual([]);

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      comment,
      "Check the fees.",
    );
    comment.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(),
  );

  await until(() => expect(server.sent).toHaveLength(1));
  expect(server.sent[0]).toEqual({
    method: "POST",
    path: `/pages/${PAGE}/revision/reject`,
    body: { comment: "Check the fees.", expected_version: revision.version },
  });
  await until(() => expect(router.state.location.pathname).toBe("/reviews"));
  expect(text()).toContain("Change rejected");
  expect(client.getQueryData<ReviewQueueEntry[]>(["content", "review-queue"])).toEqual([]);
  expect(document.activeElement?.id).toBe("workspace-content");
  await act(async () => lateRead.resolve(Response.json(rejected)));
  noFalseNotice();
});

test("Escape closes a decision unmade and gives the focus back to the button that opened it", async () => {
  const { server } = await render("review");
  await shown();

  const reject = button("Reject")!;
  reject.focus();
  await act(async () => reject.click());
  await until(() => expect(dialog()).not.toBeNull());
  await act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });

  await until(() => expect(dialog()).toBeNull());
  await until(() => expect(document.activeElement).toBe(button("Reject")));
  expect(server.sent).toEqual([]);
});

test.each([
  [
    403,
    { error: "forbidden", message: "You can't approve a change you made." },
    "You can't approve a change you made.",
  ],
  [409, { error: "version_conflict", message: "Changed." }, "This change"],
])(
  "a publish refused with %s says why and reads the change again",
  async (status, body, message) => {
    const { server } = await render("review");
    await shown();
    const before = server.reads().length;
    server.answer(() => Response.json(body, { status }));

    await press("Approve and publish");
    await until(() => expect(dialog()).not.toBeNull());
    await act(async () => [...dialog()!.querySelectorAll("button")].at(-1)!.click());

    await until(() => expect(dialog()).toBeNull());
    await until(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain(message));
    await until(() => expect(server.reads().length).toBeGreaterThan(before));
  },
);

test("a page with nothing waiting, such as one whose change was discarded, says so and leads back to the queue", async () => {
  const { server } = await render("review");
  server.replace(null);
  await act(async () => client.invalidateQueries());

  await until(() => expect(text()).toContain("Nothing is waiting for review on this page"));
  expect(
    [...host.querySelectorAll("a")].find((item) => item.textContent === "Back to the review queue"),
  ).toBeDefined();
});

test.each([
  ["submitted", { submitted_by: "me" }],
  ["saved to", { contributors: ["editor-1", "me"] }],
])("an approver who %s the change isn't offered a decision on it", async (_how, own) => {
  const { server } = await render("review");
  server.replace({ ...revision, ...own });
  await act(async () => client.invalidateQueries());

  await until(() =>
    expect(text()).toContain(
      "You worked on this change, so another approver must publish or reject it.",
    ),
  );
  expect(button("Approve and publish")).toBeUndefined();
  expect(button("Reject")).toBeUndefined();
});

test("a publish refused because the change was decided elsewhere says so where the screen was, and takes the focus there", async () => {
  const { server } = await render("review");
  await shown();
  server.answer(() => {
    server.replace(null);

    return Response.json({ error: "not_found", message: "Gone." }, { status: 404 });
  });

  await press("Approve and publish");
  await until(() => expect(dialog()).not.toBeNull());
  await act(async () => [...dialog()!.querySelectorAll("button")].at(-1)!.click());

  await until(() => expect(text()).toContain("Nothing is waiting for review on this page"));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("This change");
  await until(() => expect(document.activeElement?.textContent).toContain("Nothing is waiting"));
});

test("a change decided elsewhere while the approver writes a rejection says so, rather than losing the dialog unexplained", async () => {
  const { server } = await render("review");
  await shown();
  await press("Reject");
  await until(() => expect(dialog()).not.toBeNull());

  server.replace(null);
  await act(async () => client.invalidateQueries());

  await until(() => expect(dialog()).toBeNull());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Another approver published or rejected this change while you were reviewing it.",
  );
  expect(server.sent).toEqual([]);
});

test("a rejection refused (403) says why and reads the change and the roles again", async () => {
  const { server } = await render("review");
  await shown();
  const reads = server.reads().length;

  const roleReads = server.fetch.mock.calls.filter(([url]) =>
    String(url).endsWith("/editor/me"),
  ).length;

  server.answer(() =>
    Response.json(
      { error: "forbidden", message: "You need the approver role to do this." },
      { status: 403 },
    ),
  );

  await press("Reject");
  await until(() => expect(dialog()).not.toBeNull());
  const comment = dialog()!.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      comment,
      "No.",
    );
    comment.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(),
  );

  await until(() => expect(dialog()).toBeNull());
  await until(() =>
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "You need the approver role to do this.",
    ),
  );
  await until(() => expect(server.reads().length).toBeGreaterThan(reads));
  await until(() =>
    expect(
      server.fetch.mock.calls.filter(([url]) => String(url).endsWith("/editor/me")).length,
    ).toBeGreaterThan(roleReads),
  );
});

test("a change that can't be published as it stands keeps the dialog open, naming the field", async () => {
  const { server } = await render("review");
  await shown();
  server.answer(() =>
    Response.json(
      {
        error: "validation_failed",
        errors: [{ field: "parent_id", message: "No page with that id." }],
      },
      { status: 422 },
    ),
  );

  await press("Approve and publish");
  await until(() => expect(dialog()).not.toBeNull());
  await act(async () => [...dialog()!.querySelectorAll("button")].at(-1)!.click());

  await until(() => expect(dialog()?.textContent).toContain("Parent page: No page with that id."));
});

const OLD = "See [the old page](/gone).";

test("publishing a change with a broken link says which one", async () => {
  await render("review", ["editor", "approver"], OLD);
  await shown();
  await press("Approve and publish");
  await until(() => expect(dialog()?.textContent).toContain("“the old page”"));
});

test("publishing a change whose links all exist adds no warning", async () => {
  await render("review", ["editor", "approver"], "See [home](/money/severance-pay).");
  await shown();
  await press("Approve and publish");
  await until(() => expect(dialog()).not.toBeNull());
  expect(dialog()?.textContent).not.toContain("exist");
});

test("the publish dialog can't be confirmed until the page list has been read", async () => {
  let release: () => void = () => {};

  const gate = new Promise<void>((resolve) => (release = resolve));

  const { server } = await render("review", ["editor", "approver"], OLD, async () => {
    await gate;

    return Response.json(["/money/severance-pay"]);
  });

  await shown();
  await press("Approve and publish");
  await until(() => expect(dialog()?.textContent).toContain("Checking its links"));

  const confirm = () =>
    [...dialog()!.querySelectorAll("button")].find(
      (item) => item.textContent?.startsWith("Approve and publish") ?? false,
    )!;

  expect(confirm().disabled).toBe(true);
  expect(server.sent).toHaveLength(0);

  await act(async () => release());
  await until(() => expect(dialog()?.textContent).toContain("“the old page”"));
  expect(confirm().disabled).toBe(false);
});

test("a failed page list after an earlier good one says the links weren't checked, not that they're fine", async () => {
  let fail = false;

  await render("review", ["editor", "approver"], OLD, async () =>
    fail
      ? Response.json({ error: "down" }, { status: 500 })
      : Response.json(["/money/severance-pay", "/gone"]),
  );
  await shown();
  await press("Approve and publish");
  await until(() => expect(dialog()?.textContent).not.toContain("Checking"));
  expect(dialog()?.textContent).not.toContain("exist");
  await act(async () => dialog()!.querySelector<HTMLButtonElement>("button")!.click());
  await until(() => expect(dialog()).toBeNull());

  fail = true;
  await press("Approve and publish");
  await until(() => expect(dialog()?.textContent).toContain("could not check"));
  expect(dialog()?.textContent).not.toContain("doesn’t exist");
});

test("a change whose content can't be read as a page says its links weren't checked", async () => {
  await render("review", ["editor", "approver"], "<div>raw html</div>");
  await shown();
  await press("Approve and publish");
  await until(() => expect(dialog()?.textContent).toContain("could not check"));
});

test("a lost publish confirms the live content without a transient decided-elsewhere notice", async () => {
  const { server, router } = await render("review");
  await shown();
  const noFalseNotice = watchDecisionNotices();
  const readBack = Promise.withResolvers<Response>();
  server.pageRead(() => readBack.promise);
  server.answer(() => {
    server.replace(null);
    throw new TypeError("Lost answer");
  });
  await press("Approve and publish");
  await until(() => expect(dialog()).not.toBeNull());
  await confirmDecision();

  try {
    await until(() =>
      expect(client.getQueryState(["content", "revision", PAGE])?.status).toBe("error"),
    );
    noFalseNotice();
    expect(dialog()?.textContent).toContain("Publish this change?");
    expect(router.state.location.pathname).toBe(`/reviews/${PAGE}`);
    expect(server.sent).toHaveLength(1);
    noFalseNotice();
  } finally {
    await act(async () => readBack.resolve(Response.json(publishedPage)));
  }

  await until(() => expect(router.state.location.pathname).toBe("/reviews"));
  expect(text()).toContain("Change published");
  expect(document.activeElement?.id).toBe("workspace-content");
  expect(client.getQueryData<ReviewQueueEntry[]>(["content", "review-queue"])).toEqual([]);
  expect(server.sent).toHaveLength(1);
  noFalseNotice();
});

test("a lost rejection keeps its comment while the shared read runs ahead of confirmation", async () => {
  const { server, router } = await render("review");
  await shown();
  const noFalseNotice = watchDecisionNotices();
  const readBack = Promise.withResolvers<void>();
  let reads = 0;
  server.revisionRead(async () => {
    reads += 1;

    if (reads > 1) await readBack.promise;

    return Response.json(rejected);
  });
  server.answer(() => {
    server.replace(rejected);
    throw new TypeError("Lost answer");
  });
  await press("Reject");
  await until(() => expect(dialog()).not.toBeNull());
  await enterComment("  Check the fees.  ");
  await confirmDecision();

  try {
    await until(() =>
      expect(client.getQueryData<ApiRevision>(["content", "revision", PAGE])?.status).toBe(
        "rejected",
      ),
    );
    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelector("textarea")?.value).toBe("  Check the fees.  ");
    expect(dialog()?.querySelector("textarea")?.readOnly).toBe(true);
    expect(router.state.location.pathname).toBe(`/reviews/${PAGE}`);
    expect(server.sent).toHaveLength(1);
    noFalseNotice();
  } finally {
    await act(async () => readBack.resolve());
  }

  await until(() => expect(router.state.location.pathname).toBe("/reviews"));
  expect(text()).toContain("Change rejected");
  expect(server.sent[0]?.body).toEqual({ expected_version: 1, comment: "Check the fees." });
  expect(document.activeElement?.id).toBe("workspace-content");
  expect(client.getQueryData<ReviewQueueEntry[]>(["content", "review-queue"])).toEqual([]);
  expect(server.sent).toHaveLength(1);
  noFalseNotice();
});

test.each(["publish", "reject"] as const)(
  "%s uses the version opened in the dialog, not the refreshed comparison",
  async (decision) => {
    const { server, rerender } = await render("review");
    await shown();
    await press(decision === "publish" ? "Approve and publish" : "Reject");
    await until(() => expect(dialog()).not.toBeNull());

    if (decision === "reject") await enterComment("Check the fees.");
    server.replace({ ...revision, version: 2, fields: { ...revision.fields, title: "New title" } });
    await act(async () => client.invalidateQueries({ queryKey: ["content"] }));
    await until(() =>
      expect(client.getQueryData<ApiRevision>(["content", "revision", PAGE])?.version).toBe(2),
    );
    await rerender();
    expect(host.querySelector("h1")?.textContent).toBe("Severance pay");
    server.answer(() =>
      Response.json({ error: "version_conflict", message: "Changed." }, { status: 409 }),
    );
    await confirmDecision();
    await until(() => expect(dialog()).toBeNull());
    expect(server.sent[0]?.body).toEqual(
      decision === "publish"
        ? { expected_version: 1 }
        : { expected_version: 1, comment: "Check the fees." },
    );
    expect(text()).toContain("This change was edited after you opened it, so nothing was decided.");
    expect(host.querySelector("h1")?.textContent).toBe("New title");
  },
);

test("an unanswered rejection retries the original comment and version after a refresh", async () => {
  const { server, rerender } = await render("review");
  await shown();
  server.answer(() => {
    throw new TypeError("Lost answer");
  });
  await press("Reject");
  await until(() => expect(dialog()).not.toBeNull());
  await enterComment("  Check the fees.  ");
  await confirmDecision();
  await until(() => expect(dialog()?.textContent).toContain("We didn't get an answer"));
  const field = dialog()!.querySelector("textarea")!;
  expect(field.readOnly).toBe(true);

  server.replace({
    ...revision,
    id: "other-revision",
    version: 9,
    fields: { ...revision.fields, title: "New title" },
  });
  await act(async () => client.invalidateQueries({ queryKey: ["content"] }));
  await until(() =>
    expect(client.getQueryData<ApiRevision>(["content", "revision", PAGE])?.version).toBe(9),
  );
  await rerender();
  expect(host.querySelector("h1")?.textContent).toBe("Severance pay");
  expect(field.value).toBe("  Check the fees.  ");
  server.answer(() =>
    Response.json({ error: "version_conflict", message: "Changed." }, { status: 409 }),
  );
  await confirmDecision();
  await until(() => expect(dialog()).toBeNull());
  expect(server.sent).toHaveLength(2);
  expect(server.sent[1]?.body).toEqual(server.sent[0]?.body);
  expect(server.sent[1]?.body).toEqual({ expected_version: 1, comment: "Check the fees." });
  expect(text()).toContain("We still can't confirm your earlier attempt.");
  expect(text()).not.toContain("so nothing was decided");
});

test("an unconfirmed publish keeps the dialog through absence and preserves the later refusal", async () => {
  const { server, router } = await render("review");
  await shown();
  const noFalseNotice = watchDecisionNotices();
  server.pageRead(() => Response.json({ ...publishedPage, title: "Different content" }));
  server.answer(() => {
    server.replace(null);
    throw new TypeError("Lost answer");
  });
  await press("Approve and publish");
  await until(() => expect(dialog()).not.toBeNull());
  await confirmDecision();
  await until(() => expect(dialog()?.textContent).toContain("We didn't get an answer"));
  expect(router.state.location.pathname).toBe(`/reviews/${PAGE}`);
  expect(server.sent).toHaveLength(1);
  noFalseNotice();

  server.answer(() => Response.json({ error: "not_found" }, { status: 404 }));
  await confirmDecision();
  await until(() => expect(dialog()).toBeNull());
  expect(server.sent[1]?.body).toEqual(server.sent[0]?.body);
  expect(text()).toContain("We still can't confirm your earlier attempt.");
  expect(text()).toContain("Nothing is waiting for review on this page");
  expect(document.activeElement?.textContent).toContain("Nothing is waiting");
  noFalseNotice();
});

test.each([400, 409])(
  "a non-version %s keeps the existing refusal wording and reload behaviour",
  async (status) => {
    const { server } = await render("review");
    await shown();
    const reads = server.reads().length;
    server.answer(() =>
      Response.json({ error: "not_submitted", message: "Submit this first." }, { status }),
    );
    await press("Approve and publish");
    await until(() => expect(dialog()).not.toBeNull());
    await confirmDecision();

    if (status === 409) {
      await until(() => expect(dialog()).toBeNull());
      expect(text()).toContain("Submit this first.");
      await until(() => expect(server.reads().length).toBeGreaterThan(reads));
    } else {
      expect(dialog()?.textContent).toContain("We could not publish this change. Try again.");
      expect(server.reads()).toHaveLength(reads);
    }
  },
);
