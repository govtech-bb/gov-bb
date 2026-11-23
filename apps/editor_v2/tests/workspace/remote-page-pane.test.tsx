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
import { SidePanel } from "../../src/ui/side-panel";
import { Toaster } from "../../src/ui/toast";
import { RemotePagePane } from "../../src/workspace/remote-page-pane";
import { pageHasUnsavedChanges, type PageSession } from "../../src/workspace/page-session";
import { pageControl, renderInPage } from "../helpers/page-editor";

const page: ApiPage = {
  version: 1,
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
  last_edited_by: null,
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
  // null: /editor/me can't be read
  roles: readonly string[] | null = ["editor", "approver"],
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/editor/me"))
        return Promise.resolve(
          roles
            ? Response.json({ id: "me", email: "me@govtech.bb", name: "Me", roles })
            : Response.json({}, { status: 503 }),
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
        <main id="workspace-content" tabIndex={-1}>
          <RemotePagePane
            api={api}
            id={page.id}
            active
            onSession={(_id, current) => {
              session = current;
            }}
          />
        </main>
        <Toaster />
      </QueryClientProvider>
    </RouterContextProvider>,
  );
  await act(async () => {
    await vi.waitFor(() => expect(session).toBeDefined());
  });

  return { client, api, session: () => session! };
}

/** Opens the late notice beside the page's title, once it has come. */
async function openPageAlert() {
  await act(async () => {
    await vi.waitFor(() => pageControl("[data-document-alert]"));
  });
  await act(async () => pageControl<HTMLButtonElement>("[data-document-alert]").click());
}

async function applySource(session: PageSession, source: string) {
  await act(async () => {
    session.store.edit(source);
    expect(session.store.apply()).toBe(true);
  });
}

test("a confirmed save preserves unapplied source typed while the response was pending", async () => {
  const reply = Promise.withResolvers<Response>();
  let sent: SavePageInput | undefined;

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "PUT") {
      sent = JSON.parse(String(init.body));

      return reply.promise;
    }

    return Response.json(page);
  });

  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nSubmitted");
  await savePage();
  await act(async () =>
    h.session().store.edit(h.session().store.getSnapshot().source + "\n\nUnapplied"),
  );
  const newer = h.session().store.getSnapshot();
  await act(async () => reply.resolve(Response.json({ ...page, ...sent, version: 2 })));
  await vi.waitFor(() => expect(h.session().getBaseline().page.version).toBe(2));
  expect(h.session().store.getSnapshot()).toBe(newer);
  expect(newer.dirty).toBe(true);
});

// A submission meanwhile moved the version for something no save does, so identical text there isn't this save landing
test("an uncertain retry freezes its request, and identical text in another review state never adopts the baseline", async () => {
  const writes: string[] = [];
  let latest = page;

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "PUT") {
      writes.push(String(init.body));

      if (writes.length === 1) {
        latest = {
          ...page,
          ...JSON.parse(String(init.body)),
          version: 3,
          pending_revision: { status: "submitted", comment: null },
        };
        throw new TypeError("Lost response");
      }

      return Response.json({ error: "version_conflict", message: "Changed" }, { status: 409 });
    }

    return Response.json(latest);
  });

  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nSubmitted");
  const baseline = h.session().getBaseline();
  await savePage();
  await act(async () =>
    h.session().store.edit(h.session().store.getSnapshot().source + "\n\nNew source"),
  );
  const draft = h.session().store.getSnapshot();
  await openPageAlert();
  await act(async () => button("Retry same save")!.click());
  await vi.waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toBe(writes[0]);
  expect(h.session().getBaseline()).toBe(baseline);
  expect(h.session().store.getSnapshot()).toBe(draft);
  expect(button("Keep my version")).toBeUndefined();
});

test("a lost save is confirmed automatically without briefly announcing its own version as someone else's", async () => {
  const writes: string[] = [];
  let latest = page;
  let reads = 0;
  const check = Promise.withResolvers<Response>();

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "PUT") {
      writes.push(String(init.body));
      latest = { ...page, ...JSON.parse(String(init.body)), version: 2 };
      throw new TypeError("Lost response");
    }

    if (writes.length && ++reads > 1) return check.promise;

    return Response.json(latest);
  });

  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nSaved");
  const notices: string[] = [];

  const watch = new MutationObserver((changes) => {
    for (const change of changes)
      for (const node of change.addedNodes) notices.push(node.textContent ?? "");
  });

  watch.observe(document.body, { childList: true, subtree: true });

  try {
    await savePage();
    await act(async () => {
      await vi.waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
      await vi.waitFor(() =>
        expect(h.client.getQueryData(pageQuery(h.api, page.id).queryKey)?.version).toBe(2),
      );
    });
    expect(h.session().isSaving()).toBe(true);
    expect(h.session().getBaseline().page.version).toBe(1);
    expect(document.querySelector("[data-document-alert]")).toBeNull();

    await act(async () => check.resolve(Response.json(latest)));
    await act(async () => {
      await vi.waitFor(() => expect(h.session().getBaseline().page.version).toBe(2));
    });
    expect(writes).toHaveLength(1);
    expect(h.session().isSaving()).toBe(false);
    expect(notices.join(" ")).not.toContain("Newer version saved");
    expect(notices.join(" ")).not.toContain("A newer version of this page has been saved");
  } finally {
    watch.disconnect();
  }
});

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

test.each([
  { last_edited_by: { id: "editor", name: "Jane Smith" }, shown: "Jane Smith" },
  { last_edited_by: { id: "system", name: "System" }, shown: "System" },
  { last_edited_by: { id: "former", name: null }, shown: "a former employee" },
  { last_edited_by: null, shown: null },
  {
    last_edited_by: { id: "unicode", name: "山田太郎 — ليلى أحمد" },
    shown: "山田太郎 — ليلى أحمد",
  },
  { last_edited_by: { id: "long", name: "A".repeat(250) }, shown: "A".repeat(250) },
])(
  "shows recorded page attribution $shown without writing it into Markdown",
  async ({ last_edited_by, shown }) => {
    const h = await mountPage(async () => Response.json({ ...page, last_edited_by }));
    expect(document.body.textContent?.includes("Edited by")).toBe(shown !== null);
    const name = document.querySelector("bdi");
    expect(name?.textContent ?? null).toBe(shown);

    if (name) {
      expect(name.classList).toContain("wrap-anywhere");
      expect(name.hasAttribute("tabindex")).toBe(false);
    }

    expect(h.session().getBaseline().page.last_edited_by).toEqual(last_edited_by);
    expect(h.session().store.getSnapshot().committed).not.toContain("last_edited_by");
  },
);

test.each(["", "preview"])(
  "a legacy draft can return from %j without losing edits or writing until Save",
  async (value) => {
    const body = "\nWhat it costs.  \nBring ID.\n\n";
    let current = { ...page, body_markdown: body };
    const writes: SavePageInput[] = [];

    const h = await mountPage(async (_url, init) => {
      if (init?.method === "PUT") {
        const fields = JSON.parse(String(init.body));
        writes.push(fields);
        current = {
          ...current,
          ...fields,
          version: current.version + 1,
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
    expect(writes[0]).toMatchObject({
      title: "Later title edit",
      visibility: "draft",
      body_markdown: body,
    });

    await chooseVisibility(value);
    expect(writes).toHaveLength(1);
    await savePage(value ? "Save" : "Publish changes");
    await act(async () => {
      await vi.waitFor(() =>
        expect(h.session().getBaseline().page.visibility).toBe(value || "public"),
      );
    });
    expect(writes[1]).toMatchObject({ visibility: value || "public", body_markdown: body });
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
      version: 3,
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

test("where the roles can't be read, the visibility says so rather than that it's only for approvers", async () => {
  await mountPage(async () => Response.json(page), null);

  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(
      "We couldn’t check your permissions, so who can see this page can’t be changed until we can.",
    ),
  );
  expect(document.body.textContent).not.toContain(LOCKED);
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

test("a save that lands is never shown as someone else's newer version", async () => {
  let current = page;

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "PUT") current = { ...page, ...JSON.parse(String(init.body)), version: 2 };

    return Response.json(current);
  });

  await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nMine");
  let announced = false;

  // Looked at after every change to the page, so a notice that comes and goes is still caught
  const watch = new MutationObserver(() => {
    announced ||= !!document.querySelector("[data-document-alert]");
  });

  watch.observe(document.body, { childList: true, subtree: true, characterData: true });

  try {
    await savePage();
    await vi.waitFor(() => expect(h.session().getBaseline().page.version).toBe(2));
    await vi.waitFor(() =>
      expect(h.client.getQueryData(pageQuery(h.api, page.id).queryKey)?.version).toBe(2),
    );
    await act(async () => {});
  } finally {
    watch.disconnect();
  }

  expect(announced).toBe(false);
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
        version: 2,
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
      version: 3,
      updated_at: "2026-10-07T14:00:00.000Z",
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Newer version saved"));
  });

  await openPageAlert();

  const loadSaved = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Discard my changes and reload",
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

test.each([
  { preview: false, action: "Copy my version" },
  { preview: false, action: "Discard my changes and reload" },
  { preview: true, action: "Copy my version" },
  { preview: true, action: "Discard my changes and reload" },
])(
  "$action restores focus after answering a newer version (preview: $preview)",
  async ({ preview, action }) => {
    vi.stubGlobal("scrollTo", () => {});
    const h = await mountPage(async () => Response.json(page));
    await applySource(
      h.session(),
      h.session().store.getSnapshot().committed + "\n\nKeep my changes.",
    );

    if (preview)
      await act(async () => pageControl<HTMLButtonElement>("[data-site-preview-trigger]").click());

    await act(async () => {
      h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
        ...page,
        version: 3,
        updated_at: "2026-10-07T14:00:00.000Z",
      });
      await vi.waitFor(() => expect(document.body.textContent).toContain("Newer version saved"));
    });

    await openPageAlert();

    const answer = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === action,
    )!;

    answer.focus();
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    await act(async () => answer.click());

    if (action === "Copy my version") {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        h.session().store.getSnapshot().source,
      );
      expect(answer.isConnected).toBe(true);

      return;
    }

    expect(answer.isConnected).toBe(false);
    expect(document.activeElement).toBe(pageControl("[data-document-bar] h1"));
  },
);

test("a failed pane keeps unsaved work, and retry moves focus into the recovered screen", async () => {
  const h = await mountPage(async () => Response.json(page));
  const draft = h.session().store.getSnapshot().source + "\n\nKeep this unsaved edit.";

  // Fail after an edit, not before the pane has a working copy to retain.
  vi.spyOn(console, "error").mockImplementation(() => {});

  const broken = vi.spyOn(SidePanel, "Root").mockImplementation(() => {
    throw new Error("The settings couldn't be drawn");
  });

  await applySource(h.session(), draft);

  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("This page couldn’t be shown"),
  );
  expect(h.session().store.getSnapshot().source).toBe(draft);
  expect(pageHasUnsavedChanges(h.session())).toBe(true);

  const button = (name: string) =>
    [...document.querySelectorAll("button")].find((item) => item.textContent === name)!;

  const saved: string[] = [];
  Object.defineProperty(URL, "createObjectURL", { value: () => "blob:page", configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });

  await act(async () => button("Download a copy").click());
  expect(saved).toEqual(["page.md"]);

  broken.mockRestore();
  button("Try again").focus();
  await act(async () => button("Try again").click());
  await vi.waitFor(() => expect(pageControl('textarea[aria-label="Page title"]')).toBeTruthy());
  expect(document.body.textContent).not.toContain("This page couldn’t be shown");
  expect(document.body.textContent).toContain("Keep this unsaved edit.");
  expect(h.session().store.getSnapshot().source).toBe(draft);
  expect(document.activeElement).toBe(document.getElementById("workspace-content"));
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
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

const keptKey = "govbb-editor:unsaved-work:" + page.id;

const KEPT = "This browser kept your unsaved changes";

test("old browser drafts are ignored, and with storage blocked the page still edits without an automatic save", async () => {
  localStorage.setItem("govbb-editor:documents:" + page.id + ":markdown", "Old draft");
  localStorage.setItem("govbb-editor:workspace:v1", "{broken");

  const blocked = () => {
    throw Error("Storage blocked");
  };

  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
  const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
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
  expect(document.body.textContent).not.toContain(KEPT);

  // Only the page's own unsaved work is asked for and kept, never an old draft
  for (const storage of [read, write, remove]) {
    expect(storage).toHaveBeenCalled();
    expect(storage.mock.calls.every(([key]) => key === keptKey)).toBe(true);
  }

  expect(writes).toBe(0);
});

/** Opens the page again as a reload does: nothing in memory, only what the API and this browser hold. */
async function reloadPage(request: Parameters<typeof mountPage>[0]) {
  await renderInPage(null);

  return mountPage(request);
}

test("a reload offers back the unsaved changes kept in this browser, and restoring them is one step to undo", async () => {
  const first = await mountPage(async () => Response.json(page));
  const unsaved = first.session().store.getSnapshot().committed + "\n\nNot saved yet.";
  await applySource(first.session(), unsaved);

  await reloadPage(async () => Response.json(page));
  expect(document.body.textContent).toContain(KEPT);

  // Left unanswered, it's offered again. The page opens as the API has it: what was kept waits for an answer
  const h = await reloadPage(async () => Response.json(page));
  expect(document.body.textContent).toContain(KEPT);
  expect(h.session().store.getSnapshot().committed).not.toContain("Not saved yet.");
  expect(pageHasUnsavedChanges(h.session())).toBe(false);

  button("Restore changes")!.focus();
  await act(async () => button("Restore changes")!.click());
  expect(h.session().store.getSnapshot().committed).toBe(unsaved);
  expect(document.querySelector('[aria-label="Page content"]')?.textContent).toContain(
    "Not saved yet.",
  );
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
  expect(h.session().getBaseline().page.version).toBe(page.version);
  expect(document.body.textContent).not.toContain(KEPT);
  // The offer went with its focused button: the page's heading takes the focus
  expect(document.activeElement).toBe(pageControl("[data-document-bar] h1"));

  await act(async () => pageControl<HTMLButtonElement>('button[aria-label="Undo"]').click());
  expect(h.session().store.getSnapshot().committed).not.toContain("Not saved yet.");
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
});

test("discarding recovered changes asks first, Cancel keeps them, and confirmation leaves the page unchanged", async () => {
  const first = await mountPage(async () => Response.json(page));
  const saved = first.session().store.getSnapshot().committed;
  await applySource(first.session(), saved + "\n\nNot saved yet.");

  const h = await reloadPage(async () => Response.json(page));
  button("Discard changes…")!.focus();
  await act(async () => button("Discard changes…")!.click());
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "Discard recovered changes?",
  );
  expect(localStorage.getItem(keptKey)).toContain("Not saved yet.");
  await act(async () => button("Cancel")!.click());
  expect(document.body.textContent).toContain(KEPT);
  expect(localStorage.getItem(keptKey)).toContain("Not saved yet.");
  await act(async () => {
    await vi.waitFor(() => expect(document.activeElement).toBe(button("Discard changes…")));
  });

  await act(async () => button("Discard changes…")!.click());
  await act(async () => button("Discard changes")!.click());
  expect(document.body.textContent).not.toContain(KEPT);
  expect(h.session().store.getSnapshot().committed).toBe(saved);
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(pageControl("[data-document-bar] h1")),
    );
  });
  expect(localStorage.getItem(keptKey)).toBeNull();

  await reloadPage(async () => Response.json(page));
  expect(document.body.textContent).not.toContain(KEPT);
});

test("changes typed while an offer waits are the ones kept, and the offer can still be restored", async () => {
  const first = await mountPage(async () => Response.json(page));
  const saved = first.session().store.getSnapshot().committed;
  await applySource(first.session(), saved + "\n\nKept before the reload.");

  const h = await reloadPage(async () => Response.json(page));
  await applySource(h.session(), saved + "\n\nTyped after it.");
  expect(localStorage.getItem(keptKey)).toContain("Typed after it.");
  expect(document.body.textContent).toContain(KEPT);

  await act(async () => button("Restore changes")!.click());
  expect(h.session().store.getSnapshot().committed).toBe(saved + "\n\nKept before the reload.");
  expect(localStorage.getItem(keptKey)).toContain("Kept before the reload.");
});

test("a save leaves nothing kept in this browser to offer after a reload", async () => {
  let current = page;

  const request = async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") current = { ...page, ...JSON.parse(String(init.body)), version: 2 };

    return Response.json(current);
  };

  const h = await mountPage(request);
  await applySource(h.session(), h.session().store.getSnapshot().committed + "\n\nSaved soon.");
  expect(JSON.parse(localStorage.getItem(keptKey)!)).toMatchObject({ version: page.version });
  expect(localStorage.getItem(keptKey)).toContain("Saved soon.");

  await savePage();
  await act(async () => {
    await vi.waitFor(() => expect(pageHasUnsavedChanges(h.session())).toBe(false));
  });
  expect(localStorage.getItem(keptKey)).toBeNull();

  await reloadPage(request);
  expect(document.body.textContent).not.toContain(KEPT);
});

test("discarding the open copy for the saved version forgets what was kept of it", async () => {
  const h = await mountPage(async () => Response.json(page));
  await applySource(h.session(), h.session().store.getSnapshot().committed + "\n\nGive this up.");
  expect(localStorage.getItem(keptKey)).toContain("Give this up.");

  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...page,
      version: 3,
      updated_at: "2026-10-07T14:00:00.000Z",
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Newer version saved"));
  });
  await openPageAlert();
  await act(async () => button("Discard my changes and reload")!.click());
  await act(async () => {
    await vi.waitFor(() =>
      expect(h.session().store.getSnapshot().committed).not.toContain("Give this up."),
    );
  });
  expect(localStorage.getItem(keptKey)).toBeNull();
  expect(document.body.textContent).not.toContain(KEPT);
});

test("discarding the open copy while a recovery offer waits offers the same recovery again, not the edits given up", async () => {
  const first = await mountPage(async () => Response.json(page));
  const saved = first.session().store.getSnapshot().committed;
  await applySource(first.session(), saved + "\n\nKept before the reload.");
  const offered = localStorage.getItem(keptKey);

  const h = await reloadPage(async () => Response.json(page));
  await applySource(h.session(), saved + "\n\nTyped after it.");
  expect(localStorage.getItem(keptKey)).toContain("Typed after it.");

  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...page,
      version: 3,
      updated_at: "2026-10-07T14:00:00.000Z",
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Newer version saved"));
  });
  await openPageAlert();
  await act(async () => button("Discard my changes and reload")!.click());
  await act(async () => {
    await vi.waitFor(() =>
      expect(h.session().store.getSnapshot().committed).not.toContain("Typed after it."),
    );
  });
  expect(localStorage.getItem(keptKey)).toBe(offered);
  expect(document.body.textContent).toContain(KEPT);

  await act(async () => button("Restore changes")!.click());
  expect(h.session().store.getSnapshot().committed).toBe(saved + "\n\nKept before the reload.");
});

test("a recovery offer can't be discarded while discard-and-reload is reading the page", async () => {
  const first = await mountPage(async () => Response.json(page));
  const saved = first.session().store.getSnapshot().committed;
  await applySource(first.session(), saved + "\n\nKept before the reload.");
  let hold: PromiseWithResolvers<void> | undefined;
  let current = page;

  const h = await reloadPage(async (_url, init) => {
    if (hold && init?.method !== "PUT") await hold.promise;

    return Response.json(current);
  });

  await applySource(h.session(), saved + "\n\nTyped after it.");
  current = { ...page, version: 3, updated_at: "2026-10-07T14:00:00.000Z" };
  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, current);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Newer version saved"));
  });
  hold = Promise.withResolvers();
  await openPageAlert();
  await act(async () => button("Discard my changes and reload")!.click());

  const discard = button("Discard changes…")!;
  expect(discard.getAttribute("aria-disabled")).toBe("true");
  await act(async () => discard.click());
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();

  await act(async () => hold!.resolve());
  await act(async () => {
    await vi.waitFor(() =>
      expect(h.session().store.getSnapshot().committed).not.toContain("Typed after it."),
    );
  });
  expect(localStorage.getItem(keptKey)).toContain("Kept before the reload.");
  expect(button("Discard changes…")!.getAttribute("aria-disabled")).toBeNull();
});

test("undoing what was typed while a recovery offer waits puts the offer back, so a reload offers it again", async () => {
  const first = await mountPage(async () => Response.json(page));
  const saved = first.session().store.getSnapshot().committed;
  await applySource(first.session(), saved + "\n\nKept before the reload.");
  const offered = localStorage.getItem(keptKey);

  const h = await reloadPage(async () => Response.json(page));
  await applySource(h.session(), saved + "\n\nTyped after it.");
  expect(localStorage.getItem(keptKey)).toContain("Typed after it.");

  await act(async () => pageControl<HTMLButtonElement>('button[aria-label="Undo"]').click());
  expect(h.session().store.getSnapshot().committed).toBe(saved);
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
  expect(localStorage.getItem(keptKey)).toBe(offered);

  const again = await reloadPage(async () => Response.json(page));
  await act(async () => button("Restore changes")!.click());
  expect(again.session().store.getSnapshot().committed).toBe(saved + "\n\nKept before the reload.");
});

test("saving what was typed while a recovery offer waits doesn't leave the saved changes to be offered later", async () => {
  const first = await mountPage(async () => Response.json(page));
  const saved = first.session().store.getSnapshot().committed;
  await applySource(first.session(), saved + "\n\nKept before the reload.");
  let current = page;

  const request = async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") current = { ...page, ...JSON.parse(String(init.body)), version: 2 };

    return Response.json(current);
  };

  const h = await reloadPage(request);
  await applySource(h.session(), saved + "\n\nTyped and saved.");
  await savePage();
  await act(async () => {
    await vi.waitFor(() => expect(pageHasUnsavedChanges(h.session())).toBe(false));
  });
  expect(localStorage.getItem(keptKey)).not.toContain("Typed and saved.");

  // Someone else saves after it, so the saved changes no longer match the page
  current = { ...current, version: 3, title: "Saved by someone else" };
  const again = await reloadPage(request);
  expect(document.body.textContent).toContain(KEPT);
  await act(async () => button("Restore changes")!.click());
  expect(again.session().store.getSnapshot().committed).toContain("Kept before the reload.");
  expect(again.session().store.getSnapshot().committed).not.toContain("Typed and saved.");
});

test("restoring an offer after saving over it shows the page's own save as a newer version, and can't save over it", async () => {
  const first = await mountPage(async () => Response.json(page));
  const saved = first.session().store.getSnapshot().committed;
  await applySource(first.session(), saved + "\n\nKept before the reload.");
  let current = page;
  let writes = 0;

  const request = async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      writes++;
      current = { ...page, ...JSON.parse(String(init.body)), version: 2 };
    }

    return Response.json(current);
  };

  const h = await reloadPage(request);
  await applySource(h.session(), saved + "\n\nTyped and saved.");
  await savePage();
  await act(async () => {
    await vi.waitFor(() => expect(pageHasUnsavedChanges(h.session())).toBe(false));
  });

  await act(async () => button("Restore changes")!.click());
  expect(h.session().getBaseline().page.version).toBe(page.version);
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("Newer version saved"));
  });

  const save = button("Save")!;
  expect(save.getAttribute("aria-disabled")).toBe("true");
  await act(async () => save.click());
  expect(writes).toBe(1);
});

test("changes kept over a version the page has moved past restore as changes to a page saved since, and can't be saved over it", async () => {
  const first = await mountPage(async () => Response.json(page));
  const unsaved = first.session().store.getSnapshot().committed + "\n\nWritten over version 1.";
  await applySource(first.session(), unsaved);

  let writes = 0;

  const h = await reloadPage(async (_url, init) => {
    if (init?.method === "PUT") writes++;

    return Response.json({ ...page, version: 2, title: "Saved by someone else" });
  });

  await act(async () => button("Restore changes")!.click());
  expect(h.session().store.getSnapshot().committed).toBe(unsaved);
  // The page stands on the version they were written over, as it would had it never been reloaded
  expect(h.session().getBaseline().page.version).toBe(page.version);
  await vi.waitFor(() => expect(document.body.textContent).toContain("Newer version saved"));

  const save = button("Save")!;
  expect(save.getAttribute("aria-disabled")).toBe("true");
  await act(async () => save.click());
  expect(writes).toBe(0);
  expect(JSON.parse(localStorage.getItem(keptKey)!)).toMatchObject({
    markdown: unsaved,
    version: page.version,
  });
});

test("undo and redo restore the recovery's write version, and editing after undo saves against the current version", async () => {
  const first = await mountPage(async () => Response.json(page));
  const recovered = first.session().store.getSnapshot().committed + "\n\nRecovered work.";
  await applySource(first.session(), recovered);
  let current = { ...page, version: 2, title: "Saved by someone else" };
  const writes: (SavePageInput & { expected_version: number })[] = [];

  const h = await reloadPage(async (_url, init) => {
    if (init?.method === "PUT") {
      const sent: (typeof writes)[number] = JSON.parse(String(init.body));
      writes.push(sent);
      current = { ...current, ...sent, version: 3 };
    }

    return Response.json(current);
  });

  const beforeRestore = h.session().store.getSnapshot().committed + "\n\nNew work.";
  await applySource(h.session(), beforeRestore);
  await act(async () => button("Restore changes")!.click());
  expect(h.session().getBaseline().page.version).toBe(1);

  await act(async () => pageControl<HTMLButtonElement>('button[aria-label="Undo"]').click());
  expect(h.session().store.getSnapshot().committed).toBe(beforeRestore);
  expect(h.session().getBaseline().page.version).toBe(2);
  expect(button("Newer version saved")).toBeUndefined();
  expect(button("Save")!.getAttribute("aria-disabled")).toBeNull();
  expect(JSON.parse(localStorage.getItem(keptKey)!)).toMatchObject({ version: 2 });

  await act(async () => pageControl<HTMLButtonElement>('button[aria-label="Redo"]').click());
  expect(h.session().store.getSnapshot().committed).toBe(recovered);
  expect(h.session().getBaseline().page.version).toBe(1);
  expect(button("Save")!.getAttribute("aria-disabled")).toBe("true");
  expect(JSON.parse(localStorage.getItem(keptKey)!)).toMatchObject({ version: 1 });

  await act(async () => pageControl<HTMLButtonElement>('button[aria-label="Undo"]').click());
  await applySource(h.session(), beforeRestore + "\n\nEdited after undo.");
  await savePage();
  expect(writes).toHaveLength(1);
  expect(writes[0]?.expected_version).toBe(2);
  expect(writes[0]?.body_markdown).toContain("Edited after undo.");
  expect(writes[0]?.body_markdown).not.toContain("Recovered work.");
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
});

test("restoring content already typed over the current version does not introduce an older write version", async () => {
  const first = await mountPage(async () => Response.json(page));
  const recovered = first.session().store.getSnapshot().committed + "\n\nRecovered work.";
  await applySource(first.session(), recovered);
  const h = await reloadPage(async () => Response.json({ ...page, version: 2 }));
  await applySource(h.session(), recovered);
  await act(async () => button("Restore changes")!.click());
  expect(h.session().store.getSnapshot().committed).toBe(recovered);
  expect(h.session().getBaseline().page.version).toBe(2);
  expect(button("Save")!.getAttribute("aria-disabled")).toBeNull();
  await act(async () => pageControl<HTMLButtonElement>('button[aria-label="Undo"]').click());
  expect(h.session().store.getSnapshot().committed).not.toContain("Recovered work.");
  expect(h.session().getBaseline().page.version).toBe(2);
});

test("saving same-version recovery advances its baseline without retaining a recovery conflict", async () => {
  const first = await mountPage(async () => Response.json(page));
  await applySource(
    first.session(),
    first.session().store.getSnapshot().committed + "\n\nRecovered work.",
  );
  let current = page;

  const h = await reloadPage(async (_url, init) => {
    if (init?.method === "PUT") current = { ...page, ...JSON.parse(String(init.body)), version: 2 };

    return Response.json(current);
  });

  await act(async () => button("Restore changes")!.click());
  await savePage();
  await act(async () => {
    await vi.waitFor(() => expect(h.session().getBaseline().page.version).toBe(2));
  });
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
  expect(button("Newer version saved")).toBeUndefined();
  expect(localStorage.getItem(keptKey)).toBeNull();
});

test("undoing recovery does not adopt a version fetched after the page opened", async () => {
  const first = await mountPage(async () => Response.json(page));
  await applySource(
    first.session(),
    first.session().store.getSnapshot().committed + "\n\nRecovered.",
  );
  const h = await reloadPage(async () => Response.json({ ...page, version: 2 }));
  await act(async () => button("Restore changes")!.click());
  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, { ...page, version: 3 });
  });
  await act(async () => pageControl<HTMLButtonElement>('button[aria-label="Undo"]').click());
  expect(h.session().getBaseline().page.version).toBe(2);
  expect(button("Newer version saved")).toBeDefined();
  expect(button("Save")!.getAttribute("aria-disabled")).toBe("true");
});

test("Restore is disabled during a save and works after a definitive conflict", async () => {
  const first = await mountPage(async () => Response.json(page));
  const recovered = first.session().store.getSnapshot().committed + "\n\nRecovered work.";
  await applySource(first.session(), recovered);
  const reply = Promise.withResolvers<Response>();
  let current = page;

  const h = await reloadPage(async (_url, init) =>
    init?.method === "PUT" ? reply.promise : Response.json(current),
  );

  const edited = h.session().store.getSnapshot().committed + "\n\nNew work.";
  await applySource(h.session(), edited);
  await savePage();
  await act(async () => {
    await vi.waitFor(() =>
      expect(button("Restore changes")!.getAttribute("aria-disabled")).toBe("true"),
    );
  });
  expect(document.body.textContent).toContain(
    "Wait for the current request to finish before restoring.",
  );
  await act(async () => button("Restore changes")!.click());
  expect(h.session().store.getSnapshot().committed).toBe(edited);

  current = { ...page, version: 2 };
  await act(async () =>
    reply.resolve(Response.json({ error: "version_conflict" }, { status: 409 })),
  );
  await act(async () => {
    await vi.waitFor(() => expect(button("Newer version saved")).toBeDefined());
  });
  expect(button("Restore changes")!.getAttribute("aria-disabled")).toBeNull();
  await act(async () => button("Restore changes")!.click());
  expect(h.session().store.getSnapshot().committed).toBe(recovered);
  expect(h.session().getBaseline().page.version).toBe(1);
  expect(button("Save")!.getAttribute("aria-disabled")).toBe("true");
});

test("Restore explains an uncertain save and becomes available after retry confirms it", async () => {
  const first = await mountPage(async () => Response.json(page));
  const recovered = first.session().store.getSnapshot().committed + "\n\nRecovered work.";
  await applySource(first.session(), recovered);
  let current = page;
  let written = page;

  const h = await reloadPage(async (_url, init) => {
    if (init?.method === "PUT") {
      written = { ...page, ...JSON.parse(String(init.body)), version: 2 };
      throw new TypeError("Lost response");
    }

    return Response.json(current);
  });

  await applySource(h.session(), h.session().store.getSnapshot().committed + "\n\nNew work.");
  // The save's own check reads the page before the write shows, so the save stays uncertain
  await savePage();
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        "Retry the last request before restoring these changes.",
      ),
    );
  });
  expect(button("Restore changes")!.getAttribute("aria-disabled")).toBe("true");
  current = written;
  await openPageAlert();
  await act(async () => button("Retry same save")!.click());
  await act(async () => {
    await vi.waitFor(() => expect(h.session().getBaseline().page.version).toBe(2));
  });
  expect(button("Restore changes")!.getAttribute("aria-disabled")).toBeNull();
  await act(async () => button("Restore changes")!.click());
  expect(h.session().store.getSnapshot().committed).toBe(recovered);
  expect(h.session().getBaseline().page.version).toBe(1);
});

test.each([
  ["something that isn't a kept page", JSON.stringify({ markdown: 7 })],
  ["no JSON", "{broken"],
  ["what the page already holds", undefined],
])("%s under the page's key offers nothing", async (_name, kept) => {
  const first = await mountPage(async () => Response.json(page));
  const saved = first.session().store.getSnapshot().committed;

  localStorage.setItem(
    keptKey,
    kept ?? JSON.stringify({ markdown: saved, version: 1, keptAt: "2026-10-07T12:00:00.000Z" }),
  );

  const h = await reloadPage(async () => Response.json(page));
  expect(document.body.textContent).not.toContain(KEPT);
  expect(h.session().store.getSnapshot().committed).toBe(saved);
  expect(localStorage.getItem(keptKey)).toBeNull();
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
  current = { ...page, ...fields, version: 2, updated_at: "2026-10-07T13:00:00.000Z" };
  await act(async () => {
    answer(Response.json(current));
    await vi.waitFor(() => expect(h.session().isSaving()).toBe(false));
  });
  expect(h.session().getBaseline()).toEqual({ page: current, markdown: first });
  expect(draftOption()).toBeNull();
  expect(h.session().store.getSnapshot().committed).toBe(second);
  expect(pageHasUnsavedChanges(h.session())).toBe(true);
  expect(JSON.parse(String(sent!.body)).expected_version).toBe(page.version);

  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...current,
      version: 3,
      updated_at: "2026-10-07T14:00:00.000Z",
      title: "Someone else's edit",
      visibility: "draft",
    });
  });
  expect(h.session().getBaseline().page.updated_at).toBe(current.updated_at);
  expect(h.session().getBaseline().page.version).toBe(2);
  await openPageAlert();
  expect(document.body.textContent).toContain("A newer version");
  const earlierRequest = sent;
  await act(async () => button("Save")!.click());
  expect(sent).toBe(earlierRequest);
  expect(draftOption()).toBeNull();
  expect(h.session().store.getSnapshot().committed).toBe(second);
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
    await openPageAlert();
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

test("a version conflict keeps the draft and baseline until explicit discard and reload", async () => {
  const writes: string[] = [];
  let latest = page;

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "PUT") {
      writes.push(String(init.body));

      if (writes.length === 1) {
        latest = { ...page, version: 2, title: "Another author's title" };

        return Response.json(
          { error: "version_conflict", message: "Changed elsewhere." },
          { status: 409 },
        );
      }

      latest = { ...latest, ...JSON.parse(String(init.body)), version: 3 };
    }

    return Response.json(latest);
  });

  const baseline = h.session().getBaseline();
  await applySource(h.session(), baseline.markdown + "\n\nKeep this");
  const draft = h.session().store.getSnapshot();
  await savePage();
  await act(async () => {
    await vi.waitFor(() => expect(h.session().isSaving()).toBe(false));
    await vi.waitFor(() =>
      expect(h.client.getQueryData(pageQuery(h.api, page.id).queryKey)?.version).toBe(2),
    );
  });
  expect(h.session().getBaseline()).toBe(baseline);
  expect(h.session().store.getSnapshot()).toBe(draft);
  await act(async () => button("Save")!.click());
  expect(writes).toHaveLength(1);

  await openPageAlert();
  await act(async () => button("Discard my changes and reload")!.click());
  await act(async () => {
    await vi.waitFor(() => expect(h.session().getBaseline().page.version).toBe(2));
  });
  expect(h.session().store.getSnapshot().committed).not.toContain("Keep this");
  expect(h.session().getBaseline().page.title).toBe("Another author's title");
  await applySource(h.session(), h.session().store.getSnapshot().committed + "\n\nAfter reload");
  await savePage();
  expect(writes).toHaveLength(2);
  expect(JSON.parse(writes[0]!).expected_version).toBe(1);
  expect(JSON.parse(writes[1]!).expected_version).toBe(2);
});

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

test.each([
  [403, "You don’t have permission to save this change."],
  [400, "This request could not be saved."],
])(
  "a save refused (%s) without a reason from the API still says what happened",
  async (status, sentence) => {
    const h = await mountPage(async (_url, init) =>
      init?.method === "PUT" ? new Response(null, { status }) : Response.json(page),
    );

    await applySource(h.session(), h.session().store.getSnapshot().source + "\n\nKeep this");
    await savePage();
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.querySelector('[role="alert"]')?.textContent).toBe(sentence),
      );
    });
    expect(pageHasUnsavedChanges(h.session())).toBe(true);
  },
);

// Each landed write moves the baseline on, so a read begun before both shows a version older than either
test("a page read that lags two of the editor's own saves is not shown as someone else's newer version", async () => {
  let current = page;

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "PUT")
      current = { ...page, ...JSON.parse(String(init.body)), version: current.version + 1 };

    return Response.json(current);
  });

  for (const version of [2, 3]) {
    await applySource(h.session(), h.session().store.getSnapshot().source + `\n\nSave ${version}`);
    await savePage();
    await act(async () => {
      await vi.waitFor(() => expect(h.session().getBaseline().page.version).toBe(version));
      await vi.waitFor(() =>
        expect(h.client.getQueryData(pageQuery(h.api, page.id).queryKey)?.version).toBe(version),
      );
    });
  }

  // The name is on screen once the pane has rendered the lagging read
  await act(async () => {
    h.client.setQueryData(pageQuery(h.api, page.id).queryKey, {
      ...page,
      last_edited_by: { id: "lagging", name: "Lagging read" },
    });
    await vi.waitFor(() => expect(document.querySelector("bdi")?.textContent).toBe("Lagging read"));
  });
  expect(document.querySelector("[data-document-alert]")).toBeNull();
  expect(pageHasUnsavedChanges(h.session())).toBe(false);
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
        version: 2,
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
        id: "revision-1",
        page_id: live.id,
        fields: live,
        contributors: [],
        version: 2,
        status: "submitted",
        comment: null,
        updated_at: live.updated_at,
        changes: [],
      });
    }

    return Response.json(
      sent
        ? { ...drafted, version: 2, pending_revision: { status: "submitted", comment: null } }
        : drafted,
    );
  });

  await vi.waitFor(() => expect(button("Submit for review")?.disabled).toBe(false));
  await act(async () => button("Submit for review")!.click());
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain(WAITING));
  });
  expect(sent?.url).toBe(`http://localhost:3020/pages/${page.id}/revision/submit`);
  expect(JSON.parse(String(sent?.init?.body)).expected_version).toBe(live.version);
  expect(button("Submit for review")).toBeUndefined();
});

test("a lost submission is confirmed automatically without announcing a false conflict", async () => {
  const drafted: ApiPage = { ...live, pending_revision: { status: "draft", comment: null } };
  let submissions = 0;
  let reads = 0;
  let latest = drafted;
  const check = Promise.withResolvers<Response>();

  const h = await mountPage(async (_url, init) => {
    if (init?.method === "POST") {
      submissions += 1;
      latest = { ...drafted, version: 2, pending_revision: { status: "submitted", comment: null } };
      throw new TypeError("Lost response");
    }

    if (submissions && ++reads > 1) return check.promise;

    return Response.json(latest);
  });

  const notices: string[] = [];

  const watch = new MutationObserver((changes) => {
    for (const change of changes)
      for (const node of change.addedNodes) notices.push(node.textContent ?? "");
  });

  watch.observe(document.body, { childList: true, subtree: true });

  try {
    await vi.waitFor(() => expect(button("Submit for review")?.disabled).toBe(false));
    await act(async () => button("Submit for review")!.click());
    await act(async () => {
      await vi.waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
      await vi.waitFor(() =>
        expect(h.client.getQueryData(pageQuery(h.api, page.id).queryKey)?.version).toBe(2),
      );
    });
    expect(h.session().isSaving()).toBe(true);
    expect(h.session().getBaseline().page.version).toBe(1);
    expect(document.querySelector("[data-document-alert]")).toBeNull();
    await act(async () => check.resolve(Response.json(latest)));
    await act(async () => {
      await vi.waitFor(() => expect(h.session().getBaseline().page.version).toBe(2));
    });
    expect(document.body.textContent).toContain(WAITING);
    expect(submissions).toBe(1);
    expect(h.session().isSaving()).toBe(false);
    expect(notices.join(" ")).not.toContain("Newer version saved");
    expect(notices.join(" ")).not.toContain("This change couldn’t be submitted for review");
  } finally {
    watch.disconnect();
  }
});

test.each([0, 503])(
  "an unresolved submission (%s) reports uncertainty and retries its frozen version after re-renders",
  async (status) => {
    const drafted: ApiPage = { ...live, pending_revision: { status: "draft", comment: null } };
    let latest = drafted;
    const requests: string[] = [];

    const h = await mountPage(async (_url, init) => {
      if (init?.method === "POST") {
        requests.push(String(init.body));

        if (requests.length === 2)
          return Response.json(
            { error: "version_conflict", message: "Changed elsewhere." },
            { status: 409 },
          );

        if (status === 0) throw new TypeError("Lost response");

        return Response.json({ message: "Database connection lost." }, { status });
      }

      return Response.json(latest);
    });

    const baseline = h.session().getBaseline();
    await vi.waitFor(() => expect(button("Submit for review")?.disabled).toBe(false));
    await act(async () => button("Submit for review")!.click());
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("We couldn’t confirm the last request."),
      );
    });
    expect(document.body.textContent).toContain(
      "Check the saved version without discarding your open copy.",
    );
    expect(document.body.textContent).not.toContain("This change couldn’t be submitted for review");
    expect(document.body.textContent).not.toContain("Database connection lost.");
    expect(document.body.textContent).not.toContain(
      "Check you are still signed in, then try again.",
    );
    expect(h.session().getBaseline()).toBe(baseline);
    expect(requests).toHaveLength(1);
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')?.click(),
    );
    latest = { ...drafted, version: 3, title: "A newer read" };
    await act(async () => {
      h.client.setQueryData(pageQuery(h.api, page.id).queryKey, latest);
      h.session().store.edit(h.session().store.getSnapshot().source + "\n\nNew typing");
    });
    const draft = h.session().store.getSnapshot();
    await openPageAlert();
    await act(async () => button("Retry same submission")!.click());
    await act(async () => {
      await vi.waitFor(() => expect(document.body.textContent).toContain("Changed elsewhere."));
    });
    expect(requests).toEqual([
      JSON.stringify({ expected_version: 1 }),
      JSON.stringify({ expected_version: 1 }),
    ]);
    expect(h.session().getBaseline()).toBe(baseline);
    expect(h.session().store.getSnapshot()).toBe(draft);
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')?.click(),
    );
  },
);

test.each([401, 403, 422])("a submission's %s refusal keeps the API's sentence", async (status) => {
  await mountPage(async (_url, init) =>
    init?.method === "POST"
      ? Response.json(
          {
            message: "The API's explanation.",
            errors: [{ field: "version", message: "Read again" }],
          },
          { status },
        )
      : Response.json({ ...live, pending_revision: { status: "draft", comment: null } }),
  );
  await vi.waitFor(() => expect(button("Submit for review")?.disabled).toBe(false));
  await act(async () => button("Submit for review")!.click());
  await act(async () => {
    await vi.waitFor(() => expect(document.body.textContent).toContain("The API's explanation."));
  });
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')?.click(),
  );
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
        id: "revision-1",
        page_id: rejected.id,
        fields: rejected,
        contributors: [],
        changes: [],
        version: 2,
        status: "submitted",
        comment: null,
        updated_at: rejected.updated_at,
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
  expect(JSON.parse(String(sent?.body)).expected_version).toBe(rejected.version);
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
        version: 2,
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
      "if you save changes you can’t approve or reject this review",
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
        Response.json({
          ...live,
          visibility: "preview",
          version: 2,
          updated_at: "2026-10-07T13:00:00.000Z",
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
      Response.json({
        ...live,
        visibility: "preview",
        version: 2,
        updated_at: "2026-10-07T13:00:00.000Z",
      }),
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
