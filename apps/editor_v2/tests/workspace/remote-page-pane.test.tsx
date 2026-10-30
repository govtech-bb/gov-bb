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
import { createEditorApi, type ApiPage, type SavePageInput } from "../../src/api/client";
import { categoriesQuery, pageQuery } from "../../src/api/queries";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { Toaster } from "../../src/ui/toast";
import { RemotePagePane } from "../../src/workspace/remote-page-pane";
import { pageHasUnsavedChanges, type PageSession } from "../../src/workspace/page-sync";
import { pageControl, renderInPage } from "../helpers/page-editor";

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

const visibility = () => pageControl<HTMLSelectElement>("select");

const draftOption = () => visibility().querySelector<HTMLOptionElement>('option[value="draft"]');

async function chooseVisibility(value: string) {
  await act(async () => {
    const select = await vi.waitFor(visibility);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    select.blur();
  });
}

async function savePage(name = "Save") {
  const button = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === name,
  )!;

  // Save that can't be used keeps its focus, so it says so with aria-disabled rather than disabled
  expect(button.getAttribute("aria-disabled")).toBeNull();
  await act(async () => button.click());
}

test.each(["", "preview"])(
  "a legacy draft can return from %j without losing edits or writing until Save",
  async (value) => {
    let current = page;
    const writes: SavePageInput[] = [];

    const h = await mountPage(async (_url, init) => {
      if (init?.method === "PUT") {
        const fields = JSON.parse(String(init.body));
        writes.push(fields);
        current = {
          ...current,
          ...fields,
          updated_at: new Date(Date.parse(current.updated_at) + 1000).toISOString(),
        };
      }

      return Response.json(current);
    });

    await vi.waitFor(() => expect(draftOption()?.disabled).toBe(true));
    await chooseVisibility(value);
    expect(draftOption()?.disabled).toBe(false);
    const title = pageControl<HTMLTextAreaElement>('textarea[aria-label="Page title"]');
    await act(async () => {
      title.focus();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        title,
        "Later title edit",
      );
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await chooseVisibility("draft");
    expect(title.value).toBe("Later title edit");
    expect(writes).toEqual([]);
    await savePage();
    await act(async () => {
      await vi.waitFor(() => expect(pageHasUnsavedChanges(h.session())).toBe(false));
    });
    expect(writes[0]).toMatchObject({ title: "Later title edit", visibility: "draft" });

    await chooseVisibility(value);
    expect(writes).toHaveLength(1);
    await savePage(value ? "Save" : "Publish changes");
    await act(async () => {
      await vi.waitFor(() =>
        expect(h.session().getBaseline().page.visibility).toBe(value || "public"),
      );
    });
    expect(writes[1]?.visibility).toBe(value || "public");
    expect(draftOption()).toBeNull();

    await act(async () => pageControl<HTMLButtonElement>('button[aria-label="Undo"]').click());
    expect(visibility().value).toBe("draft");
    expect(draftOption()?.disabled).toBe(true);
    expect(title.value).toBe("Later title edit");
    await act(async () => pageControl<HTMLButtonElement>('button[aria-label="Redo"]').click());
    expect(visibility().value).toBe(value);
    expect(draftOption()).toBeNull();
    expect(writes).toHaveLength(2);
  },
);

test("a background visibility change does not remove the accepted draft baseline's return option", async () => {
  const h = await mountPage(async () => Response.json(page));
  await chooseVisibility("preview");
  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...page,
      visibility: "public",
      updated_at: "2026-10-07T14:00:00.000Z",
    });
  });
  expect(h.session().getBaseline().page.visibility).toBe("draft");
  expect(draftOption()?.disabled).toBe(false);
  await chooseVisibility("draft");
  expect(visibility().value).toBe("draft");
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});

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

  // Unusable, though it keeps its place for the keyboard; a press sends nothing
  expect(save.getAttribute("aria-disabled")).toBe("true");
  await act(async () => save.click());
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});

test("Save keeps the focus while it saves, and once its save leaves nothing to save", async () => {
  const answered = Promise.withResolvers<void>();
  let current = page;

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "PUT") {
      await answered.promise;
      current = {
        ...page,
        ...JSON.parse(String(init.body)),
        updated_at: "2026-10-07T13:00:00.000Z",
      };
    }

    return Response.json(current);
  });

  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nSaved soon");

  const save = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === "Save",
  )!;

  await act(async () => save.focus());
  await act(async () => save.click());
  // Working, it turns in its own colour rather than greying out, and ignores another press
  await vi.waitFor(() => expect(save.hasAttribute("data-pending")).toBe(true));
  expect(save.disabled).toBe(false);
  expect(document.activeElement).toBe(save);

  await act(async () => answered.resolve());
  await vi.waitFor(() => expect(pageHasUnsavedChanges(h.session())).toBe(false));
  expect(save.hasAttribute("data-pending")).toBe(false);
  expect(save.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(save);
});

test("a visual page stays editable without history controls or requests", async () => {
  const h = await mountPage(async () => Response.json(page));

  expect(h.session().store.getSnapshot().mode).toBe("visual");
  const buttons = [...document.querySelectorAll("button")];
  expect(buttons.map((button) => button.textContent)).not.toContain("History");
  expect(buttons.map((button) => button.textContent)).not.toContain("Restore this version");

  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nNew content");
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
  expect(
    buttons.find((button) => button.textContent === "Save")?.getAttribute("aria-disabled"),
  ).toBeNull();
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/history"))).toBe(false);
});

test("a page the editor can't show opens read-only, its content left as it was saved", async () => {
  const h = await mountPage(async () =>
    Response.json({ ...page, body_markdown: "<!-- Keep this note -->" }),
  );

  expect(h.session().store.getSnapshot().mode).toBe("source");
  expect(document.body.textContent).toContain("This page can’t be edited here");
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
  expect(document.body.textContent).toContain("The saved version couldn’t be opened");
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

  await chooseVisibility("preview");
  const first = h.session().store.getSnapshot().committed + "\n\nFirst edit";
  await applySource(h.session(), first);
  await savePage();
  expect(h.session().isSaving()).toBe(true);
  expect(draftOption()?.disabled).toBe(false);
  const second = first + "\n\nTyped during save";
  await applySource(h.session(), second);
  const fields = JSON.parse(String(sent!.body));
  current = { ...page, ...fields, updated_at: "2026-10-07T13:00:00.000Z" };
  await act(async () => {
    answer(Response.json(current));
    await vi.waitFor(() => expect(h.session().isSaving()).toBe(false));
  });
  expect(h.session().getBaseline()).toEqual({ page: current, markdown: first });
  expect(draftOption()).toBeNull();
  expect(h.session().store.getSnapshot().committed).toBe(second);
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
  expect(new Headers(sent!.headers).get("if-updated-at")).toBe(page.updated_at);

  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...current,
      updated_at: "2026-10-07T14:00:00.000Z",
      title: "Someone else's edit",
      visibility: "draft",
    });
  });
  expect(h.session().getBaseline().page.updated_at).toBe(current.updated_at);
  expect(draftOption()).toBeNull();
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

    await chooseVisibility("preview");
    const source = h.session().store.getSnapshot().source + "\n\nKeep this";
    await applySource(h.session(), source);
    await savePage();
    await act(async () => {
      await vi.waitFor(() => expect(h.session().isSaving()).toBe(false));
    });
    expect(h.session().store.getSnapshot().committed).toBe(source);
    expect(h.session().getBaseline().page).toEqual(page);
    expect(pageHasUnsavedChanges(h.session())).toBe(true);
    expect(draftOption()?.disabled).toBe(false);
    await chooseVisibility("draft");
    expect(h.session().store.getSnapshot().committed).toContain("Keep this");
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

const PENDING = "Your changes are saved but not live. Submit them for review when they’re ready.";

const WAITING =
  "Waiting for review. Citizens will see these changes once an approver publishes them.";

const KEEP_EDITING = "You can keep editing";

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

test.each([
  [["editor", "approver"], true],
  [["editor"], false],
])("a change waiting for review links an approver to its review (%j)", async (roles, offered) => {
  await mountPage(
    async () =>
      Response.json({ ...live, pending_revision: { status: "submitted", comment: null } }),
    roles,
  );

  await vi.waitFor(() => expect(document.body.textContent).toContain("Waiting for review"));
  await vi.waitFor(() =>
    expect(
      [...document.querySelectorAll("a")]
        .find((item) => item.textContent === "Review this change")
        ?.getAttribute("href") ?? null,
    ).toBe(offered ? `/reviews/${live.id}` : null),
  );
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

test("a change waiting for review can still be saved, and keeps waiting", async () => {
  const waiting: ApiPage = { ...live, pending_revision: { status: "submitted", comment: null } };
  let current = waiting;

  const h = await mountPage(async (_url, init) => {
    // api_v2 updates the waiting revision in place
    if (init?.method === "PUT")
      current = {
        ...waiting,
        ...JSON.parse(String(init.body)),
        updated_at: "2026-10-07T13:00:00.000Z",
      };

    return Response.json(current);
  });

  await vi.waitFor(() => expect(document.body.textContent).toContain(WAITING));
  await vi.waitFor(() => expect(document.body.textContent).toContain(KEEP_EDITING));
  const source = h.session().store.getSnapshot().source + "\n\nOne more thing";
  await applySource(h.session(), source);
  await savePage();
  await act(async () => {
    await vi.waitFor(() =>
      expect(h.session().getBaseline().page.updated_at).toBe("2026-10-07T13:00:00.000Z"),
    );
  });
  expect(document.body.textContent).toContain(WAITING);
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(h.session().store.getSnapshot().committed).toBe(source);
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
});

test("an editor who approves is warned that saving to a change waiting for review stops them deciding on it", async () => {
  await mountPage(async () =>
    Response.json({ ...live, pending_revision: { status: "submitted", comment: null } }),
  );

  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(
      "if you save changes you can't approve or reject this review",
    ),
  );
});

test("an editor who isn't an approver is told saved changes are added to the review", async () => {
  await mountPage(
    async () =>
      Response.json({ ...live, pending_revision: { status: "submitted", comment: null } }),
    ["editor"],
  );

  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(
      "You can keep editing: changes you save are added to this review.",
    ),
  );
});

test("someone without the editor role isn't told they can keep editing a change waiting for review", async () => {
  await mountPage(
    async () =>
      Response.json({ ...live, pending_revision: { status: "submitted", comment: null } }),
    [],
  );

  await vi.waitFor(() => expect(document.body.textContent).toContain(WAITING));
  // The workspace says why they can't save once the roles have loaded
  await vi.waitFor(() => expect(document.body.textContent).toContain(LOCKED));
  expect(document.body.textContent).not.toContain(KEEP_EDITING);
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

test("taking a public page with an unpublished change out of view shows its live content, saying the change was discarded", async () => {
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

  expect(document.body.textContent).toContain("Its unpublished changes were discarded.");
  expect(h.session().store.getSnapshot().committed).toContain(live.body_markdown);
  expect(h.session().store.getSnapshot().committed).not.toContain("Unreviewed rewrite.");
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')?.click(),
  );
});

test("a change discarded while more was typed is still announced, and the typing is kept for checking", async () => {
  const waiting: ApiPage = {
    ...live,
    body_markdown: "Unreviewed rewrite.",
    pending_revision: { status: "draft", comment: null },
  };

  let answer: (response: Response) => void = () => {};

  const h = await mountPage(async (_url, init) =>
    init?.method === "PUT"
      ? new Promise<Response>((resolve) => {
          answer = resolve;
        })
      : Response.json(waiting),
  );

  await vi.waitFor(() => expect(visibilitySelect()).toBeDefined());
  await act(async () => {
    const select = visibilitySelect()!;
    select.value = "preview";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await savePage();
  const typed = h.session().store.getSnapshot().source + "\n\nTyped during the save";
  await applySource(h.session(), typed);
  await act(async () => {
    answer(
      Response.json({ ...live, visibility: "preview", updated_at: "2026-10-07T13:00:00.000Z" }),
    );
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("your open copy still contains them"),
    );
  });

  expect(h.session().store.getSnapshot().committed).toContain("Typed during the save");
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')?.click(),
  );
});

const withLinks =
  (request: (url: string, init?: RequestInit) => Promise<Response>) =>
  (url: string, init?: RequestInit) =>
    url.endsWith("/editor/page-paths")
      ? Promise.resolve(Response.json(["/family/birth-certificate"]))
      : request(url, init);

const linkBody =
  "---\ntitle: Fees\nurl: /family/birth-certificate/fees\n---\n\nSee [the old page](/gone).";

test("a broken link warns by its words but doesn't stop a draft save", async () => {
  const writes: SavePageInput[] = [];

  const h = await mountPage(
    withLinks(async (_url, init) => {
      if (init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)));

        return Response.json({
          ...page,
          updated_at: "2026-10-07T12:01:00.000Z",
        });
      }

      return Response.json(page);
    }),
  );

  await applySource(h.session(), linkBody.replace("url:", "visibility: draft\nurl:"));
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("doesn’t exist"));
  });
  await savePage();
  expect(writes).toHaveLength(1);
});

test("making a page public with a broken link asks first", async () => {
  const writes: SavePageInput[] = [];

  const h = await mountPage(
    withLinks(async (_url, init) => {
      if (init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)));

        return Response.json({ ...page, visibility: "public" });
      }

      return Response.json(page);
    }),
  );

  await applySource(h.session(), linkBody.replace("url:", "visibility: public\nurl:"));
  await savePage("Publish changes");
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Publish with broken links?"),
    );
  });
  expect(writes).toHaveLength(0);

  await act(async () =>
    [...document.querySelectorAll("button")]
      .filter((item) => item.textContent === "Publish changes")
      .at(-1)!
      .click(),
  );
  await vi.waitFor(() => expect(writes).toHaveLength(1));
});

test("choosing a broken link's warning puts the caret in that link", async () => {
  const h = await mountPage(withLinks(async () => Response.json(page)));

  await applySource(h.session(), linkBody.replace("url:", "visibility: draft\nurl:"));
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("doesn’t exist"));
  });
  await act(async () => {
    [...document.querySelectorAll("button")]
      .find((item) => item.textContent === "the old page")!
      .click();
  });
  await act(async () => {
    await vi.waitFor(() => {
      const anchor = window.getSelection()?.anchorNode;

      expect(anchor?.textContent).toBe("the old page");
    });
  });
});

test("link checks wait for links, and a failed recheck does not block a draft save", async () => {
  const writes: SavePageInput[] = [];
  let lookups = 0;

  const h = await mountPage(async (url, init) => {
    if (url.endsWith("/editor/page-paths")) {
      lookups++;

      return Response.json({ error: "down" }, { status: 500 });
    }

    if (init?.method === "PUT") {
      writes.push(JSON.parse(String(init.body)));

      return Response.json(page);
    }

    return Response.json(page);
  });

  expect(lookups).toBe(0);
  await applySource(h.session(), linkBody.replace("url:", "visibility: draft\nurl:"));
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("could not check"));
  });
  const before = lookups;
  await savePage();
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  expect(lookups).toBeGreaterThan(before);
});

test("publishing while the page list can't be read asks, without calling the links broken", async () => {
  let up = true;

  const h = await mountPage(async (url) => {
    if (url.endsWith("/editor/page-paths"))
      return up ? Response.json(["/family/birth-certificate"]) : Response.json({}, { status: 500 });

    return Response.json(page);
  });

  await applySource(h.session(), linkBody);
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("doesn’t exist"));
  });
  up = false;
  await savePage("Publish changes");
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Publish without checking links?"),
    );
  });
  expect(document.body.textContent).not.toContain("Publish with broken links?");
});

test("the host is notified when a link check starts and finishes, so leaving waits for it", async () => {
  let pending: Promise<Response> | undefined;
  const writes: SavePageInput[] = [];

  const h = await mountPage(async (url, init) => {
    if (url.endsWith("/editor/page-paths"))
      return pending ?? Response.json(["/family/birth-certificate"]);

    if (init?.method === "PUT") writes.push(JSON.parse(String(init.body)));

    return Response.json(page);
  });

  await applySource(h.session(), linkBody);
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("doesn’t exist"));
  });
  const before = h.session();
  let answer!: (response: Response) => void;
  pending = new Promise((resolve) => {
    answer = resolve;
  });
  await savePage("Publish changes");
  expect(h.session().isSaving()).toBe(true);
  expect(h.session()).not.toBe(before);
  const checking = h.session();

  await act(async () => {
    answer(Response.json(["/family/birth-certificate"]));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Publish with broken links?"),
    );
  });
  expect(h.session().isSaving()).toBe(false);
  expect(h.session()).not.toBe(checking);
  expect(writes).toHaveLength(0);
});

test("removing the last link also removes an earlier lookup failure warning", async () => {
  const h = await mountPage(async (url) =>
    url.endsWith("/editor/page-paths") ? Response.json({}, { status: 500 }) : Response.json(page),
  );

  await applySource(h.session(), linkBody.replace("url:", "visibility: draft\nurl:"));
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("could not check"));
  });
  await applySource(h.session(), "---\ntitle: Fees\nvisibility: draft\n---\n\nNo links remain.");
  expect(document.body.textContent).not.toContain("could not check");
});
