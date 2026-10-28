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
import { pageContentVersionSchema } from "../../src/api/page-schemas";
import { govbbPageCodec } from "../../src/presets/govbb-page";
import { Toaster } from "../../src/ui/toast";
import { RemotePagePane } from "../../src/workspace/remote-page-pane";
import { DocumentSessions } from "../../src/workspace/document-views";
import { pageHasUnsavedChanges, type PageSession } from "../../src/workspace/page-sync";
import { renderInPage } from "../helpers/page-editor";
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

async function mountPage(request: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
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
    await vi.waitFor(() => expect(session?.getEditLockToken()).toBeDefined());
  });

  return { client, api, locks, session: () => session! };
}

async function applySource(session: PageSession, source: string) {
  await act(async () => {
    session.store.edit(source);
    expect(session.store.apply()).toBe(true);
  });
}

async function clickButton(label: string, within: ParentNode = document) {
  const button = [...within.querySelectorAll("button")].find((item) => item.textContent === label);

  if (!button) throw new Error(`Missing page control: ${label}`);
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}

async function savePage() {
  const button = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === "Save",
  )!;

  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}

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

test("a failed reload keeps unsaved work and its baseline read-only", async () => {
  let current = page;
  const h = await mountPage(async () => Response.json(current));
  const store = h.session().store;
  const source = store.getSnapshot().committed + "\n\nKeep my changes.";
  await applySource(h.session(), source);
  const baseline = h.session().getBaseline();

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

  const first = h.session().store.getSnapshot().committed + "\n\nFirst edit";
  await applySource(h.session(), first);
  await savePage();
  expect(h.session().isSaving()).toBe(true);
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
    });
  });
  expect(h.session().getBaseline().page.version).toBe(current.version);
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
