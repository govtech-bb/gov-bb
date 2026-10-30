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
import { createEditorApi, type ApiRevision, type ReviewQueueEntry } from "../../src/api/client";
import { Toaster } from "../../src/ui/toast";
import { ReviewQueueScreen, ReviewScreen } from "../../src/workspace/review-screens";

const PAGE = "44444444-4444-4444-8444-444444444444";

const STAMP = "2026-10-28T12:00:00.000Z";

/** The shared page version the approver reviews, as the queue and the revision both carry it. */
const VERSION = 7;

const entry: ReviewQueueEntry = {
  id: "55555555-5555-4555-8555-555555555555",
  page_id: PAGE,
  title: "Severance pay",
  url: "/money/severance-pay",
  submitted_by: "editor-1",
  submitted_by_name: "Ada Editor",
  submitted_at: "2026-10-28T11:00:00.000Z",
  updated_at: STAMP,
  version: VERSION,
};

const revision: ApiRevision = {
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
  updated_at: STAMP,
  version: VERSION,
  changes: [
    { field: "title", live: "Calculate severance pay", proposed: "Severance pay" },
    { field: "body_markdown", live: "Intro\n\n## Fees", proposed: "Intro\n\n## Costs" },
  ],
};

type Sent = { method: string; path: string; editLock: string | null; body: unknown };

/** The content API's review routes; `decision` answers a publish or reject. */
function contentApi(roles: string[]) {
  const sent: Sent[] = [];
  let current: ApiRevision | null = revision;
  let decision: () => Response = () => Response.json({});

  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname + new URL(url).search;
    const method = init?.method ?? "GET";

    if (method === "POST") {
      sent.push({
        method,
        path,
        // Review steps are lease-exempt: no editing credential is ever sent with them
        editLock: new Headers(init?.headers).get("x-page-edit-lock-token"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

      return decision();
    }

    if (path === "/editor/me")
      return Response.json({ id: "me", email: "me@govtech.bb", name: "Me", roles });

    if (path === "/editor/categories") return Response.json({ categories: [] });

    if (path === "/revisions?status=submitted")
      return Response.json({ revisions: current?.status === "submitted" ? [entry] : [] });

    if (path === `/pages/${PAGE}/revision`)
      return current
        ? Response.json(current)
        : Response.json({ error: "not_found" }, { status: 404 });

    return Response.json({ error: "not_found" }, { status: 404 });
  });

  return {
    fetch,
    sent,
    answer: (next: () => Response) => void (decision = next),
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

async function render(screen: "queue" | "review", roles = ["editor", "approver"]) {
  const server = contentApi(roles);
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
  await act(async () =>
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

  return { server, router };
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

const shown = () =>
  until(() => expect(host.querySelector("h1")?.textContent).toBe("Severance pay"));

test("the queue lists each change waiting for review, linking to its comparison", async () => {
  await render("queue");

  await until(() => expect(text()).toContain("Submitted by Ada Editor"));
  const link = [...host.querySelectorAll("a")].find((item) => item.textContent === "Severance pay");
  expect(link?.getAttribute("href")).toBe(`/reviews/${PAGE}`);
  expect(text()).toContain(entry.url);
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
  server.answer(() => {
    server.replace(null);

    return Response.json({});
  });

  await press("Approve and publish");
  await until(() => expect(dialog()?.textContent).toContain("Publish this change?"));
  const confirm = [...dialog()!.querySelectorAll("button")].at(-1)!;
  await act(async () => confirm.click());

  await until(() => expect(router.state.location.pathname).toBe("/reviews"));
  expect(server.sent).toEqual([
    {
      method: "POST",
      path: `/pages/${PAGE}/revision/publish`,
      editLock: null,
      body: { version: VERSION },
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
});

test("a rejection needs a comment, which goes to the editor with the version reviewed", async () => {
  const { server } = await render("review");
  await shown();

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
    editLock: null,
    body: { comment: "Check the fees.", version: VERSION },
  });
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
  [
    409,
    { error: "conflict", message: "Changed." },
    "This change was updated or decided on after you opened it.",
  ],
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
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "This change was updated or decided on after you opened it.",
  );
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
