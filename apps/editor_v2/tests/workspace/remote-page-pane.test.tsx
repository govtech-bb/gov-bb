/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createEditorApi, type ApiPage } from "../../src/api/client";
import { categoriesQuery, pageQuery } from "../../src/api/queries";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { Toaster } from "../../src/ui/toast";
import { RemotePagePane } from "../../src/workspace/remote-page-pane";
import { pageHasUnsavedChanges, type PageSession } from "../../src/workspace/page-sync";
import { renderInPage } from "../helpers/page-editor";

const page: ApiPage = {
  id: "44444444-4444-4444-8444-444444444444",
  url: "/family/birth-certificate/fees",
  slug: "fees",
  category_id: null,
  parent_id: "22222222-2222-4222-8222-222222222222",
  title: "Fees",
  description: null,
  visibility: "draft",
  form_id: null,
  body_markdown: "What it costs.",
  frontmatter: {},
  published_at: null,
  created_at: "2026-10-07T12:00:00.000Z",
  updated_at: "2026-10-07T12:00:00.000Z",
  pending_revision: null,
};

const router = createRouter({
  routeTree: createRootRoute(),
  history: createMemoryHistory({ initialEntries: ["/services"] }),
});

afterEach(() => localStorage.clear());

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

async function mountPage(
  request: (url: string, init?: RequestInit) => Promise<Response>,
  roles = ["editor", "approver"],
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/editor/me"))
        return Promise.resolve(
          Response.json({ id: "me", email: "me@govtech.bb", name: "Me", roles }),
        );

      if (url.endsWith("/editor/categories"))
        return Promise.resolve(Response.json({ categories: [] }));

      if (url.endsWith("/services")) return Promise.resolve(Response.json([]));

      return request(url, init);
    }),
  );
  const api = createEditorApi("http://localhost:3020");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let session: PageSession | undefined;
  await renderInPage(
    <RouterContextProvider router={router}>
      <QueryClientProvider client={client}>
        <RemotePagePane
          api={api}
          id={page.id}
          active
          onSession={(_id, current) => {
            session = current;
          }}
        />
        <Toaster />
      </QueryClientProvider>
    </RouterContextProvider>,
  );
  await act(async () => {
    await vi.waitFor(() => expect(session).toBeDefined());
  });

  return { client, api, session: () => session! };
}

async function applySource(session: PageSession, source: string) {
  await act(async () => {
    session.store.edit(source);
    expect(session.store.apply()).toBe(true);
  });
}

async function savePage() {
  const button = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === "Save",
  )!;

  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}

// The visibility control is the select offering the visibilities
const visibilitySelect = () =>
  [...document.querySelectorAll("select")].find((select) =>
    select.textContent?.includes("Preview link only"),
  );

const LOCKED = "Only approvers can change who can see this page.";

test("an approver is offered the page's visibility", async () => {
  await mountPage(async () => Response.json(page));

  await vi.waitFor(() => expect(visibilitySelect()).toBeDefined());
  expect(document.body.textContent).not.toContain(LOCKED);
});

test("someone who isn't an approver sees the page's visibility, and why they can't change it", async () => {
  await mountPage(async () => Response.json(page), ["editor"]);

  await vi.waitFor(() => expect(document.body.textContent).toContain(LOCKED));
  expect(visibilitySelect()).toBeUndefined();
});

test("someone without the editor role can't save", async () => {
  const h = await mountPage(async () => Response.json(page), []);

  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nKeep this");
  await vi.waitFor(() => expect(document.body.textContent).toContain(LOCKED));

  const save = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === "Save",
  )!;

  expect(save.disabled).toBe(true);
});

test("a visual page stays editable without history controls or requests", async () => {
  const h = await mountPage(async () => Response.json(page));

  expect(h.session().store.getSnapshot().mode).toBe("visual");
  const buttons = [...document.querySelectorAll("button")];
  expect(buttons.map((button) => button.textContent)).not.toContain("History");
  expect(buttons.map((button) => button.textContent)).not.toContain("Restore this version");

  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nNew content");
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
  expect(buttons.find((button) => button.textContent === "Save")?.disabled).toBe(false);
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/history"))).toBe(false);
});

test("a page the editor can't show opens read-only, its content left as it was saved", async () => {
  const h = await mountPage(async () =>
    Response.json({ ...page, body_markdown: "<!-- Keep this note -->" }),
  );

  expect(h.session().store.getSnapshot().mode).toBe("source");
  expect(document.body.textContent).toContain("This page can't be edited here");
  const names = [...document.querySelectorAll("button")].map((button) => button.textContent);
  expect(names).not.toContain("Save");
  expect(names).not.toContain("History");
  expect(names).not.toContain("Restore this version");
  expect(names).not.toContain("Markdown");
  expect(document.querySelector("textarea")).toBeNull();
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/history"))).toBe(false);
});

test("a rejected saved version leaves the working copy editable and its baseline unchanged", async () => {
  const h = await mountPage(async () => Response.json(page));
  const store = h.session().store;
  const source = store.getSnapshot().committed + "\n\nKeep my changes.";
  await applySource(h.session(), source);
  const baseline = h.session().getBaseline();

  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...page,
      title: "Saved elsewhere",
      updated_at: "2026-10-07T14:00:00.000Z",
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain("A newer version"));
  });

  const loadSaved = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Load saved version",
  )!;

  vi.spyOn(govbbPageCodec, "prepare").mockImplementationOnce(() => {
    throw new Error("Cannot prepare saved version");
  });

  await act(async () => loadSaved.click());

  expect(store.getSnapshot()).toMatchObject({
    source,
    committed: source,
    dirty: false,
    valid: true,
    status: "ready",
    error: undefined,
  });
  expect(h.session().getBaseline()).toEqual(baseline);
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
  expect(
    document.querySelector('[aria-label="Page content"]')?.getAttribute("contenteditable"),
  ).toBe("true");
  expect(loadSaved.disabled).toBe(false);
  expect(document.body.textContent).toContain("The saved version couldn't be opened");
  expect(document.body.textContent).toContain("Your open copy is unchanged.");
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click(),
  );
});

test("a page preloaded just now, as its link was pointed at, opens without waiting on the content API", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  // The API never answers, so only what's already loaded can open the page
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const api = createEditorApi("http://localhost:3020");
  const client = new QueryClient();
  client.setQueryData(pageQuery(api, page.id).queryKey, page);
  client.setQueryData(categoriesQuery(api).queryKey, []);

  await renderInPage(
    <RouterContextProvider router={router}>
      <QueryClientProvider client={client}>
        <RemotePagePane api={api} id={page.id} active onSession={() => {}} />
      </QueryClientProvider>
    </RouterContextProvider>,
  );

  await vi.waitFor(() =>
    expect(document.querySelector('[aria-label="Page content"]')?.textContent).toContain(
      "What it costs.",
    ),
  );
});

test("old browser drafts are ignored and editing never accesses storage or sends an automatic save", async () => {
  localStorage.setItem("govbb-editor:documents:" + page.id + ":markdown", "Old draft");
  localStorage.setItem("govbb-editor:workspace:v1", "{broken");

  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("Storage blocked");
  });

  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("Storage blocked");
  });

  let writes = 0;

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "PUT") writes++;

    return Response.json(page);
  });

  expect(h.session().store.getSnapshot().source).toContain(page.body_markdown);
  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nUnsaved");
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new StorageEvent("storage", { key: "govbb-editor:workspace:v1" }));
  });
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(writes).toBe(0);
});

test("a slow save acknowledges only its submitted snapshot; refetch cannot overwrite newer work or its write token", async () => {
  let current = page;
  let answer: (response: Response) => void = () => {};

  let sent: RequestInit | undefined;

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "PUT") {
      sent = init;

      return new Promise<Response>((resolve) => {
        answer = resolve;
      });
    }

    return Response.json(current);
  });

  const first = h.session().store.getSnapshot().committed + "\n\nFirst edit";
  await applySource(h.session(), first);
  await savePage();
  expect(h.session().isSaving()).toBe(true);
  const second = first + "\n\nTyped during save";
  await applySource(h.session(), second);
  const fields = JSON.parse(String(sent!.body));
  current = { ...page, ...fields, updated_at: "2026-10-07T13:00:00.000Z" };
  await act(async () => {
    answer(Response.json(current));
    await vi.waitFor(() => expect(h.session().isSaving()).toBe(false));
  });
  expect(h.session().getBaseline()).toEqual({ page: current, markdown: first });
  expect(h.session().store.getSnapshot().committed).toBe(second);
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
  expect(new Headers(sent!.headers).get("if-updated-at")).toBe(page.updated_at);

  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...current,
      updated_at: "2026-10-07T14:00:00.000Z",
      title: "Someone else's edit",
    });
  });
  expect(h.session().getBaseline().page.updated_at).toBe(current.updated_at);
  expect(h.session().store.getSnapshot().committed).toBe(second);
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("A newer version"));
  });
});

test.each([0, 503, 401, 403, 404])(
  "a failed background read (%s) explains the failure without unmounting the working copy",
  async (status) => {
    let offline = false;

    const h = await mountPage(async () => {
      if (offline) {
        if (status === 0) throw Error("Offline");

        return Response.json({}, { status });
      }

      return Response.json(page);
    });

    const original = h.session().store;
    await applySource(h.session(), original.getSnapshot().source + "\n\nKeep offline edits");
    offline = true;
    await act(async () => {
      await h.client.refetchQueries({ queryKey: pageQuery(h.api, page.id).queryKey });
    });
    expect(h.session().store).toBe(original);
    expect(original.getSnapshot().source).toContain("Keep offline edits");
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain(
          status === 401
            ? "Your session has ended"
            : status === 403
              ? "You no longer have access to this page"
              : status === 404
                ? "This page is no longer available"
                : "We could not refresh this page",
        ),
      );
    });
  },
);

test.each([401, 404, 409, 422, 503, 0])(
  "failed save %s retains the in-memory working copy and original baseline",
  async (status) => {
    const h = await mountPage(async (_url, init) => {
      if (init?.method !== "PUT") return Response.json(page);

      if (status === 0) throw Error("Offline");

      return Response.json({ errors: [{ field: "url", message: "Taken" }] }, { status });
    });

    const source = h.session().store.getSnapshot().source + "\n\nKeep this";
    await applySource(h.session(), source);
    await savePage();
    await act(async () => {
      await vi.waitFor(() => expect(h.session().isSaving()).toBe(false));
    });
    expect(h.session().store.getSnapshot().committed).toBe(source);
    expect(h.session().getBaseline().page).toEqual(page);
    expect(pageHasUnsavedChanges(h.session())).toBe(true);
  },
);

test("a save the API refuses (403) says why and offers no retry, keeping the working copy", async () => {
  const h = await mountPage(async (_url, init) =>
    init?.method === "PUT"
      ? Response.json(
          { error: "forbidden", message: "Only approvers can change who can see a page." },
          { status: 403 },
        )
      : Response.json(page),
  );

  const source = h.session().store.getSnapshot().source + "\n\nKeep this";
  await applySource(h.session(), source);
  await savePage();
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "Only approvers can change who can see a page.",
      ),
    );
  });
  const names = [...document.querySelectorAll("button")].map((button) => button.textContent);
  expect(names).not.toContain("Retry");
  expect(document.body.textContent).not.toContain("We could not save this page");
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
});

const PENDING = "Your changes are saved but not live. Submit them for review when they're ready.";

const WAITING =
  "Waiting for review. Citizens will see these changes once an approver publishes them.";

const live: ApiPage = { ...page, visibility: "public", published_at: "2026-10-01T12:00:00.000Z" };

test("a change saved to a public page waits for an approver: the editor keeps it and says it isn't live", async () => {
  let current = live;

  const h = await mountPage(async (_url, init) => {
    // The API answers with the working copy: the revision laid over the live page
    if (init?.method === "PUT")
      current = {
        ...live,
        ...JSON.parse(String(init.body)),
        updated_at: "2026-10-07T13:00:00.000Z",
        pending_revision: { status: "draft", comment: null },
      };

    return Response.json(current);
  });

  expect(document.body.textContent).not.toContain(PENDING);
  const source = h.session().store.getSnapshot().source + "\n\nWaiting for review";
  await applySource(h.session(), source);
  // Saving won't publish it, so the edit is unsaved rather than unpublished
  expect(document.body.textContent).toContain("Unsaved changes");
  expect(document.body.textContent).not.toContain("Unpublished changes");
  // A public page's save doesn't publish, so it isn't offered as publishing
  await savePage();
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain(PENDING));
  });
  expect(h.session().getBaseline().page.updated_at).toBe("2026-10-07T13:00:00.000Z");
  expect(h.session().store.getSnapshot().committed).toBe(source);
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
  expect(document.body.textContent).not.toContain("A newer version");
});

test("a public page opened with a change waiting for an approver says so", async () => {
  await mountPage(async () =>
    Response.json({ ...live, pending_revision: { status: "draft", comment: null } }),
  );

  await vi.waitFor(() => expect(document.body.textContent).toContain(PENDING));
});

const button = (name: string) =>
  [...document.querySelectorAll("button")].find((item) => item.textContent === name);

test("a saved draft is submitted for review at the version the editor holds, and then says it's waiting", async () => {
  const drafted: ApiPage = { ...live, pending_revision: { status: "draft", comment: null } };
  let sent: { url: string; init?: RequestInit } | undefined;

  await mountPage(async (url, init) => {
    if (init?.method === "POST") {
      sent = { url, init };

      return Response.json({
        status: "submitted",
        comment: null,
        updated_at: live.updated_at,
        changes: [],
      });
    }

    return Response.json(
      sent ? { ...drafted, pending_revision: { status: "submitted", comment: null } } : drafted,
    );
  });

  await vi.waitFor(() => expect(button("Submit for review")?.disabled).toBe(false));
  await act(async () => button("Submit for review")!.click());
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain(WAITING));
  });
  expect(sent?.url).toBe(`http://localhost:3020/pages/${page.id}/revision/submit`);
  expect(new Headers(sent?.init?.headers).get("if-updated-at")).toBe(live.updated_at);
  expect(button("Submit for review")).toBeUndefined();
});

test("a draft with unsaved edits can't be submitted until they're saved", async () => {
  const h = await mountPage(async () =>
    Response.json({ ...live, pending_revision: { status: "draft", comment: null } }),
  );

  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nNot saved yet");

  await vi.waitFor(() => expect(button("Submit for review")?.disabled).toBe(true));
});

test("someone without the editor role isn't offered a submission", async () => {
  await mountPage(
    async () => Response.json({ ...live, pending_revision: { status: "draft", comment: null } }),
    [],
  );

  await vi.waitFor(() => expect(document.body.textContent).toContain(PENDING));
  await vi.waitFor(() => expect(button("Submit for review")).toBeUndefined());
});

const rejected: ApiPage = {
  ...live,
  pending_revision: { status: "rejected", comment: "The fee is wrong." },
};

test("a rejected change shows the approver's comment, and can be submitted again as it is", async () => {
  let sent: RequestInit | undefined;

  await mountPage(async (_url, init) => {
    if (init?.method === "POST") {
      sent = init;

      return Response.json({ status: "submitted", comment: null, updated_at: rejected.updated_at });
    }

    return Response.json(
      sent ? { ...rejected, pending_revision: { status: "submitted", comment: null } } : rejected,
    );
  });

  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("An approver rejected these changes"),
  );
  expect(document.body.textContent).toContain("The fee is wrong.");
  expect(document.body.textContent).toContain("Save your edits to start a new change");
  expect(button("Submit for review")).toBeUndefined();

  await act(async () => button("Submit again")!.click());
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain(WAITING));
  });
  expect(new Headers(sent?.headers).get("if-updated-at")).toBe(rejected.updated_at);
  expect(document.body.textContent).not.toContain("A newer version");
});

test("someone without the editor role sees a rejection's comment, but not how to act on it", async () => {
  await mountPage(async () => Response.json(rejected), []);

  await vi.waitFor(() => expect(document.body.textContent).toContain("The fee is wrong."));
  await vi.waitFor(() => expect(button("Submit again")).toBeUndefined());
  expect(document.body.textContent).not.toContain("Save your edits");
});

test.each([409, 404])("a submission refused with %s reads the page again", async (status) => {
  let reads = 0;

  await mountPage(async (url, init) => {
    if (init?.method === "POST")
      return Response.json({ error: "conflict", message: "Changed elsewhere." }, { status });

    if (url.endsWith(`/pages/${page.id}`)) reads++;

    return Response.json({ ...live, pending_revision: { status: "draft", comment: null } });
  });

  await vi.waitFor(() => expect(button("Submit for review")?.disabled).toBe(false));
  const before = reads;
  await act(async () => button("Submit for review")!.click());
  await act(async () => {
    await vi.waitFor(() => expect(reads).toBeGreaterThan(before));
  });
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("Changed elsewhere."));
  });
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')?.click(),
  );
});

test("saving a change that's waiting for review says why it can't, and keeps the working copy", async () => {
  const message =
    "This change is waiting for review. You can save more changes once an approver publishes or rejects it.";

  const h = await mountPage(async (_url, init) =>
    init?.method === "PUT"
      ? Response.json({ error: "under_review", message }, { status: 409 })
      : Response.json({ ...live, pending_revision: { status: "submitted", comment: null } }),
  );

  await vi.waitFor(() => expect(document.body.textContent).toContain(WAITING));
  const source = h.session().store.getSnapshot().source + "\n\nOne more thing";
  await applySource(h.session(), source);
  await savePage();
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(message),
    );
  });
  expect(document.body.textContent).not.toContain("A newer version");
  expect(h.session().store.getSnapshot().committed).toBe(source);
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
});

test("making a page public is offered as publishing, and its edit is unpublished until then", async () => {
  await mountPage(async () => Response.json(page));
  // The control waits for the roles
  await vi.waitFor(() => expect(visibilitySelect()).toBeDefined());

  const select = visibilitySelect()!;

  await act(async () => {
    // "Public" is the empty option
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await vi.waitFor(() =>
    expect([...document.querySelectorAll("button")].map((item) => item.textContent)).toContain(
      "Publish changes",
    ),
  );
  expect(document.body.textContent).toContain("Unpublished changes");
});

test("taking a public page with a waiting change out of view shows its live content, saying the change was discarded", async () => {
  const waiting: ApiPage = {
    ...live,
    body_markdown: "Unreviewed rewrite.",
    pending_revision: { status: "draft", comment: null },
  };

  const h = await mountPage(async (_url, init) =>
    init?.method === "PUT"
      ? // api_v2 changes only the visibility; the live content stays
        Response.json({ ...live, visibility: "preview", updated_at: "2026-10-07T13:00:00.000Z" })
      : Response.json(waiting),
  );

  await vi.waitFor(() => expect(visibilitySelect()).toBeDefined());
  await act(async () => {
    const select = visibilitySelect()!;
    select.value = "preview";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await savePage();
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("The page is no longer public"),
    );
  });

  expect(h.session().store.getSnapshot().committed).toContain(live.body_markdown);
  expect(h.session().store.getSnapshot().committed).not.toContain("Unreviewed rewrite.");
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')?.click(),
  );
});
