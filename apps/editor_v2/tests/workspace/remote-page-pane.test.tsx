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
import { pageQuery, taxonomyQuery } from "../../src/api/queries";
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
      if (url.endsWith("/taxonomy")) return Promise.resolve(Response.json({ categories: [] }));

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
  client.setQueryData(taxonomyQuery(api).queryKey, []);

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
