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
import { pageContentVersionSchema } from "../../src/api/page-schemas";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { Toaster } from "../../src/ui/toast";
import { RemotePagePane } from "../../src/workspace/remote-page-pane";
import { DocumentSessions } from "../../src/workspace/document-views";
import { pageHasUnsavedChanges, type PageSession } from "../../src/workspace/page-sync";
import { pageControl, renderInPage } from "../helpers/page-editor";
import { shownText } from "../helpers/shown-text";
import { withInMemoryPageEditLocks } from "../helpers/page-edit-locks";

const page: ApiPage = {
  version: pageContentVersionSchema.parse(1),
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

  const { api, locks } = withInMemoryPageEditLocks(createEditorApi("http://localhost:3020"), {
    nowMs: Date.now,
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sessions = new DocumentSessions();
  let session: PageSession | undefined;
  await renderInPage(
    <RouterContextProvider router={router}>
      <QueryClientProvider client={client}>
        <RemotePagePane
          api={api}
          id={page.id}
          active
          sessions={sessions}
          onSession={(_id, current) => {
            session = current;
          }}
        />
        <Toaster />
      </QueryClientProvider>
    </RouterContextProvider>,
  );
  await act(async () => {
    // Someone without the editor role never holds editing authority, so only the lock is waited for
    await vi.waitFor(() =>
      expect(
        roles.includes("editor") ? session?.getEditLockToken() : locks.get(page.id)?.claim,
      ).toBeDefined(),
    );
  });

  return { client, api, locks, sessions, session: () => session! };
}

async function applySource(session: PageSession, source: string) {
  await act(async () => {
    session.store.edit(source);
    expect(session.store.apply()).toBe(true);
  });
}

async function clickButton(label: string, within: ParentNode = document) {
  const button = [...within.querySelectorAll("button")].find((item) => shownText(item) === label);

  if (!button) throw new Error(`Missing page control: ${label}`);
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
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
          version: pageContentVersionSchema.parse(current.version + 1),
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
        version: pageContentVersionSchema.parse(page.version + 1),
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

test("a failed reload keeps unsaved work and its baseline read-only", async () => {
  let current = page;
  const h = await mountPage(async () => Response.json(current));
  const store = h.session().store;
  const source = store.getSnapshot().committed + "\n\nKeep my changes.";
  await applySource(h.session(), source);
  const baseline = h.session().getBaseline();
  const history = h.sessions.get(page.id);

  current = {
    ...page,
    title: "Saved elsewhere",
    version: pageContentVersionSchema.parse(2),
  };
  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, current);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Reload page"));
  });

  await clickButton("Reload page");
  vi.spyOn(govbbPageCodec, "prepare").mockImplementationOnce(() => {
    throw new Error("Cannot prepare saved page");
  });
  await clickButton("Discard changes and reload");
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("The saved page could not be opened"),
  );

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
  // The undo history is the open copy's, and stays with it
  expect(h.sessions.get(page.id)).toBe(history);
  expect(
    document.querySelector('[aria-label="Page content"]')?.getAttribute("contenteditable"),
  ).toBe("false");
  expect(h.session().getEditLockToken()).toBeUndefined();
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});

test("a background version change with the same timestamp cannot rebase invalid source", async () => {
  const h = await mountPage(async () => Response.json(page));
  const baseline = h.session().getBaseline();
  const store = h.session().store;
  await act(async () => store.edit("---\ntitle: [unfinished\n---\nKeep this source"));
  const workingCopy = store.getSnapshot();
  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...page,
      version: pageContentVersionSchema.parse(2),
      title: "Inherited change",
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Reload page"));
  });
  expect(h.session().getEditLockToken()).toBeUndefined();
  expect(h.session().store).toBe(store);
  expect(store.getSnapshot()).toBe(workingCopy);
  expect(h.session().getBaseline()).toBe(baseline);
  expect(h.session().getBaseline().page.version).toBe(1);
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
  current = {
    ...page,
    ...fields,
    version: pageContentVersionSchema.parse(2),
    updated_at: "2026-10-07T13:00:00.000Z",
  };
  await act(async () => {
    answer(Response.json(current));
    await vi.waitFor(() => expect(h.session().isSaving()).toBe(false));
  });
  expect(h.session().getBaseline()).toEqual({ page: current, markdown: first });
  expect(draftOption()).toBeNull();
  expect(h.session().store.getSnapshot().committed).toBe(second);
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
  expect(fields.version).toBe(page.version);
  expect(new Headers(sent!.headers).get("x-page-edit-lock-token")).toBeDefined();

  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...current,
      version: pageContentVersionSchema.parse(3),
      updated_at: "2026-10-07T14:00:00.000Z",
      title: "Someone else's edit",
      visibility: "draft",
    });
  });
  expect(h.session().getBaseline().page.version).toBe(current.version);
  expect(draftOption()).toBeNull();
  expect(h.session().store.getSnapshot().committed).toBe(second);
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("Reload page"));
  });
});

test("an uncertain save keeps raw edits until confirmed reload, without offering competing copies", async () => {
  let current = page;
  let writes = 0;
  const response = Promise.withResolvers<Response>();

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "PUT") {
      writes++;

      return response.promise;
    }

    return Response.json(current);
  });

  const store = h.session().store;
  const submitted = store.getSnapshot().committed + "\n\nSubmitted content";
  await applySource(h.session(), submitted);
  await savePage();
  await act(async () => store.edit("---\ntitle: [unfinished\n---\nNew raw source"));
  const raw = store.getSnapshot();
  current = {
    ...page,
    version: pageContentVersionSchema.parse(2),
    body_markdown: "What it costs.\n\nSubmitted content",
  };
  await act(async () => {
    response.resolve(Response.json({}, { status: 503 }));
  });
  await vi.waitFor(() => expect(document.body.textContent).toContain("Save outcome unknown"));
  expect(h.session().getBaseline().page.version).toBe(1);
  expect(store.getSnapshot()).toBe(raw);
  expect(h.session().getEditLockToken()).toBeUndefined();

  expect(document.body.textContent).not.toMatch(
    /Keep my (version|working copy)|Review saved version/,
  );
  await clickButton("Reload page");
  expect(h.session().getBaseline().page.version).toBe(1);
  expect(store.getSnapshot()).toBe(raw);
  await clickButton("Cancel", document.querySelector('[role="alertdialog"]')!);
  expect(h.session().store).toBe(store);
  expect(h.session().getEditLockToken()).toBeUndefined();

  await clickButton("Reload page");
  await clickButton("Discard changes and reload");
  await vi.waitFor(() => expect(h.session().getEditLockToken()).toBeDefined());
  expect(h.session().getBaseline().page.version).toBe(2);
  expect(h.session().store.getSnapshot().committed).toContain("Submitted content");
  expect(h.session().store.getSnapshot().source).not.toContain("New raw source");
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
  expect(writes).toBe(1);
});

test("a new lock does not enable editing until a post-acquisition page read finishes", async () => {
  const response = Promise.withResolvers<Response>();
  let reads = 0;
  const mounting = mountPage(async () => (++reads === 1 ? Response.json(page) : response.promise));
  await vi.waitFor(() => expect(reads).toBe(2));

  const editable = document
    .querySelector('[aria-label="Page content"]')
    ?.getAttribute("contenteditable");

  response.resolve(Response.json({ ...page, title: "Latest saved title", version: 2 }));
  const h = await mounting;
  expect(editable).toBe("false");
  expect(h.session().getBaseline().page.title).toBe("Latest saved title");
  expect(h.session().store.getSnapshot().committed).toContain("Latest saved title");
});

test("reacquiring a lock requires reloading even when the saved page has not changed", async () => {
  const h = await mountPage(async () => Response.json(page));
  const store = h.session().store;
  await applySource(h.session(), store.getSnapshot().source + "\n\nOld unsaved changes");
  const oldToken = h.session().getEditLockToken();
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pageshow"));
  });
  await vi.waitFor(() => expect(h.locks.get(page.id)?.generation).toBe(2));
  expect(h.session().getEditLockToken()).toBeUndefined();
  expect(h.session().store).toBe(store);
  await clickButton("Reload page");
  await clickButton("Discard changes and reload");
  await vi.waitFor(() => expect(h.session().getEditLockToken()).toBeDefined());
  expect(h.session().getEditLockToken()).not.toBe(oldToken);
  expect(h.session().store.getSnapshot().committed).not.toContain("Old unsaved changes");
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
  expect(document.querySelector<HTMLButtonElement>('[aria-label="Undo"]')?.disabled).toBe(true);
});

test("a late reload cannot discard local work after editing ownership is lost", async () => {
  const response = Promise.withResolvers<Response>();
  let delayed = false;
  const h = await mountPage(async () => (delayed ? response.promise : Response.json(page)));
  const store = h.session().store;
  await applySource(h.session(), store.getSnapshot().source + "\n\nKeep these changes");
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pageshow"));
  });
  await vi.waitFor(() => expect(h.locks.get(page.id)?.generation).toBe(2));
  await clickButton("Reload page");
  delayed = true;
  await clickButton("Discard changes and reload");
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
    response.resolve(Response.json({ ...page, title: "Saved elsewhere", version: 2 }));
  });
  expect(h.session().store).toBe(store);
  expect(h.session().store.getSnapshot().source).toContain("Keep these changes");
  expect(h.session().getBaseline().page).toEqual(page);
  expect(h.session().getEditLockToken()).toBeUndefined();
});

test.each(["request fails", "source changes"])(
  "confirmed reload preserves recovery input when %s",
  async (failure) => {
    const response = Promise.withResolvers<Response>();
    let delayed = false;
    const h = await mountPage(async () => (delayed ? response.promise : Response.json(page)));
    const store = h.session().store;
    await act(async () => store.edit("---\ntitle: [unfinished\n---\nOriginal raw source"));
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      window.dispatchEvent(new Event("pageshow"));
    });
    await vi.waitFor(() => expect(h.locks.get(page.id)?.generation).toBe(2));
    await clickButton("Reload page");
    delayed = true;
    await clickButton("Discard changes and reload");
    await act(async () => {
      if (failure === "source changes") store.edit("Keep this later recovery input");
      response.resolve(
        failure === "request fails" ? Response.json({}, { status: 503 }) : Response.json(page),
      );
    });
    expect(h.session().store).toBe(store);
    expect(store.getSnapshot().source).toBe(
      failure === "request fails"
        ? "---\ntitle: [unfinished\n---\nOriginal raw source"
        : "Keep this later recovery input",
    );
    expect(h.session().getBaseline().page).toEqual(page);
    expect(h.session().getEditLockToken()).toBeUndefined();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Your open changes are unchanged."),
    );
  },
);

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
  // A policy refusal is not lost editing ownership: the lock and the editable copy remain
  expect(document.body.textContent).not.toContain("We cannot confirm your editing lock");
  expect(h.session().getEditLockToken()).toBeDefined();
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
        version: pageContentVersionSchema.parse(live.version + 1),
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
  expect(h.session().getBaseline().page.version).toBe(live.version + 1);
  expect(h.session().store.getSnapshot().committed).toBe(source);
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
  expect(document.body.textContent).not.toContain("Reload page");
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
  [...document.querySelectorAll("button")].find((item) => shownText(item) === name);

const undo = () => document.querySelector<HTMLButtonElement>('[aria-label="Undo"]');

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
        version: 2,
      });
    }

    return Response.json(
      sent
        ? {
            ...drafted,
            version: 2,
            pending_revision: { status: "submitted", comment: null },
          }
        : drafted,
    );
  });

  await vi.waitFor(() => expect(button("Submit for review")?.disabled).toBe(false));
  await act(async () => button("Submit for review")!.click());
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain(WAITING));
  });
  expect(sent?.url).toBe(`http://localhost:3020/pages/${page.id}/revision/submit`);
  expect(JSON.parse(String(sent?.init?.body))).toEqual({ version: live.version });
  // Review steps are lease-exempt: no editing credential travels with them
  expect(new Headers(sent?.init?.headers).get("x-page-edit-lock-token")).toBeNull();
  expect(button("Submit for review")).toBeUndefined();
  // Its own confirmed submission moves the baseline on, so the page isn't taken as changed elsewhere
  expect(document.body.textContent).not.toContain("Reload page");
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

      return Response.json({
        status: "submitted",
        comment: null,
        updated_at: rejected.updated_at,
        version: 2,
      });
    }

    return Response.json(
      sent
        ? { ...rejected, version: 2, pending_revision: { status: "submitted", comment: null } }
        : rejected,
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
  expect(JSON.parse(String(sent?.body))).toEqual({ version: rejected.version });
  expect(document.body.textContent).not.toContain("Reload page");
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
        version: pageContentVersionSchema.parse(waiting.version + 1),
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
      expect(h.session().getBaseline().page.version).toBe(waiting.version + 1),
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
  const original = h.session().store;
  const history = h.sessions.get(page.id);
  expect(undo()?.disabled).toBe(false);
  await act(async () => button("Save")!.focus());
  await savePage();
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("The page is no longer public"),
    );
  });

  expect(document.body.textContent).toContain("Its unpublished changes were discarded.");
  // The discarded change is gone from undo too: a new working copy, with its own history
  expect(h.session().store).not.toBe(original);
  expect(h.sessions.get(page.id)).not.toBe(history);
  expect(undo()?.disabled).toBe(true);
  // Save went with the old copy; focus moves to the page rather than being dropped
  await vi.waitFor(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Page title"),
  );
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

test.each(["unapplied source", "an editor state that couldn't be converted"])(
  "a late discard acknowledgement keeps newer %s whole, with its store and undo history",
  async (kind) => {
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
    await chooseVisibility("preview");
    await savePage();
    const store = h.session().store;
    const sent = store.getSnapshot();
    const history = h.sessions.get(page.id);
    const canvas = document.querySelector('[aria-label="Page content"]');

    // Store-level stand-ins for what the page can reach while a save is out: neither moves the applied Markdown
    await act(async () => {
      if (kind === "unapplied source") store.edit(`${sent.committed}\n\nNot applied yet`);
      else {
        vi.spyOn(govbbPageCodec, "encode").mockImplementationOnce(() => {
          throw Error("Cannot convert");
        });
        store.canvasChanged(sent.state!);
      }
    });
    const newer = store.getSnapshot();
    expect(newer.committed).toBe(sent.committed);
    expect(newer).not.toBe(sent);

    await act(async () => {
      answer(
        Response.json({ ...live, visibility: "preview", updated_at: "2026-10-07T13:00:00.000Z" }),
      );
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("your open copy still contains them"),
      );
    });

    expect(h.session().store).toBe(store);
    expect(store.getSnapshot()).toBe(newer);
    expect(h.sessions.get(page.id)).toBe(history);
    expect(document.querySelector('[aria-label="Page content"]')).toBe(canvas);
    // Only the sent operation is acknowledged
    expect(h.session().getBaseline().page.visibility).toBe("preview");
    expect(pageHasUnsavedChanges(h.session())).toBe(true);
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')?.click(),
    );
  },
);

test("losing the editor role while editing makes the open copy read-only, even if the lock still answers", async () => {
  const roles = ["editor", "approver"];
  const h = await mountPage(async () => Response.json(page), roles);
  const title = pageControl<HTMLTextAreaElement>('textarea[aria-label="Page title"]');

  const reads = () =>
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/editor/me")).length;

  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nKeep this");
  expect(title.readOnly).toBe(false);
  const before = reads();

  // The role goes; the lock routes refuse, and the editor reads its roles again
  roles.splice(0);
  h.locks.get(page.id)!.failure = { kind: "forbidden" };
  await act(async () => window.dispatchEvent(new Event("focus")));
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("You no longer have permission to edit this page."),
  );
  await vi.waitFor(() => expect(reads()).toBeGreaterThan(before));
  await vi.waitFor(() => expect(title.readOnly).toBe(true));

  // A lock that answers again doesn't give back what the role took away
  h.locks.get(page.id)!.failure = undefined;
  await act(async () => window.dispatchEvent(new Event("focus")));
  await vi.waitFor(() =>
    expect(document.body.textContent).not.toContain("You no longer have permission"),
  );
  expect(h.session().getEditLockToken()).toBeUndefined();
  expect(title.readOnly).toBe(true);
  expect(h.session().store.getSnapshot().committed).toContain("Keep this");
  const save = button("Save")!;
  expect(save.getAttribute("aria-disabled")).toBe("true");
  await act(async () => save.click());
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});

test("when Reload page goes away under focus, focus moves to the page title", async () => {
  let current = page;
  const h = await mountPage(async () => Response.json(current));
  current = { ...page, version: pageContentVersionSchema.parse(2) };
  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...page,
      version: pageContentVersionSchema.parse(2),
    });
  });
  await vi.waitFor(() => expect(button("Reload page")).toBeDefined());
  await act(async () => button("Reload page")!.focus());
  await clickButton("Reload page");
  await vi.waitFor(() => expect(button("Reload page")).toBeUndefined());
  await vi.waitFor(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Page title"),
  );
});

test("a slow reload doesn't take the focus back from where the author moved it", async () => {
  const response = Promise.withResolvers<Response>();
  let slow = false;
  const h = await mountPage(async () => (slow ? response.promise : Response.json(page)));
  slow = true;
  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...page,
      version: pageContentVersionSchema.parse(2),
    });
  });
  await vi.waitFor(() => expect(button("Reload page")).toBeDefined());
  await act(async () => button("Reload page")!.focus());
  await clickButton("Reload page");
  const elsewhere = document.createElement("button");
  document.body.append(elsewhere);
  await act(async () => elsewhere.focus());
  await act(async () => response.resolve(Response.json({ ...page, version: 2 })));
  await vi.waitFor(() => expect(button("Reload page")).toBeUndefined());
  expect(document.activeElement).toBe(elsewhere);
  elsewhere.remove();
});

test("Start editing, gone once pressed, leaves focus on the page", async () => {
  const h = await mountPage(async () => Response.json(page));
  h.locks.get(page.id)!.claim = undefined;
  await act(async () => window.dispatchEvent(new Event("focus")));
  await vi.waitFor(() => expect(button("Start editing")).toBeDefined());
  // Before choosing, it says what editing again does to the open copy
  expect(document.body.textContent).toContain("download any changes you want to keep");
  await act(async () => button("Start editing")!.focus());
  await clickButton("Start editing");
  await vi.waitFor(() => expect(h.session().getEditLockToken()).toBeDefined());
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Page title");
});
