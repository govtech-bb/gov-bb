/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, type ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi, type ApiPage, type ServiceDetail } from "../../src/api/client";
import { pageContentVersionSchema } from "../../src/api/page-schemas";
import { AuthFailure, type EditorAuth } from "../../src/auth/session";
import { routeTree } from "../../src/routeTree.gen";
import { renderInPage } from "../helpers/page-editor";
import { withInMemoryPageEditLocks } from "../helpers/page-edit-locks";
import { shownText } from "../helpers/shown-text";

const stamp = "2026-10-07T12:00:00.000Z";

const pageIds = {
  service: "11111111-1111-4111-8111-111111111111",
  fees: "44444444-4444-4444-8444-444444444444",
  other: "55555555-5555-4555-8555-555555555555",
  fourth: "66666666-6666-4666-8666-666666666666",
} as const;

const pages = new Map(
  (["service", "fees", "other", "fourth"] as const).map((id) => [
    id,
    {
      id: pageIds[id],
      title: id,
      url: `/family/service/${id}`,
      slug: id,
      parent_id: id === "service" ? null : pageIds.service,
      category_id: null,
      visibility: "draft",
      form_id: null,
      body_markdown: `Body of ${id}`,
      frontmatter: {},
      description: null,
      published_at: null,
      created_at: stamp,
      updated_at: stamp,
      version: pageContentVersionSchema.parse(1),
      pending_revision: null,
    } satisfies ApiPage,
  ]),
);

const detail: ServiceDetail = {
  service: {
    id: pageIds.service,
    title: "API service",
    url: "/family/service",
    category: { slug: "family", title: "Family" },
    visibility: "draft",
    form_id: "existing-form",
    has_start_page: false,
    page_count: 4,
    updated_at: stamp,
  },
  pages: [...pages.values()].map((page) => ({
    ...page,
    role: page.id === pageIds.service ? "entry" : "supporting",
  })),
};

const clients: QueryClient[] = [];

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

async function mountWorkspace(
  path = `/services/${pageIds.service}/${pageIds.fees}`,
  {
    roles = ["editor", "approver"],
    publicIds = [],
  }: { roles?: readonly string[]; publicIds?: readonly string[] } = {},
) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("scrollTo", () => {});

  const auth: EditorAuth = {
    session: vi.fn<EditorAuth["session"]>(async () => ({
      ok: true,
      value: { email: "author@govtech.bb", expiresAt: Date.now() + 3600000 },
    })),
    signIn: vi.fn<EditorAuth["signIn"]>(async (_origin, returnTo) => ({
      ok: true,
      value: returnTo,
    })),
    signOut: vi.fn<EditorAuth["signOut"]>(async () => ({ ok: true, value: undefined })),
  };

  const writes: RequestInit[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;

      if (path === "/services") return Response.json([detail.service]);

      if (path === `/services/${pageIds.service}`)
        return Response.json({
          ...detail,
          pages: detail.pages.map((page) =>
            publicIds.includes(page.id) ? { ...page, visibility: "public" } : page,
          ),
        });

      if (path === "/editor/me")
        return Response.json({ id: "me", email: "author@govtech.bb", name: "Author", roles });

      if (path === "/editor/categories") return Response.json({ categories: [] });

      if (path === "/collections")
        return Response.json({ collections: [{ ...contacts, record_count: 1 }] });

      if (path === "/collections/contacts/records")
        return Response.json({
          collection: contacts,
          records: [{ record_key: "nis", data: { key: "nis" }, updated_at: stamp }],
        });

      if (path === "/version") return Response.json({ count: 1, latest: stamp });
      const page = [...pages.values()].find((page) => page.id === path.replace("/pages/", ""));

      if (page && init?.method === "PUT") {
        writes.push(init);

        return Response.json({
          ...page,
          ...JSON.parse(String(init.body)),
          version: pageContentVersionSchema.parse(page.version + 1),
          updated_at: "2026-10-07T13:00:00.000Z",
        });
      }

      return page ? Response.json(page) : Response.json({}, { status: 404 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  // The real app routes, without nesting an HTML document inside the test's div.
  Object.assign(routeTree.options, {
    shellComponent: ({ children }: { children: ReactNode }) => <>{children}</>,
  });

  const { api, locks } = withInMemoryPageEditLocks(createEditorApi("http://localhost:3020"), {
    nowMs: Date.now,
  });

  const router = createRouter({
    routeTree,
    context: { auth, api, queryClient: client },
    history: createMemoryHistory({ initialEntries: [path] }),
    Wrap: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });

  await renderInPage(<RouterProvider router={router} />);
  await act(async () => router.load());
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.querySelector("header")?.textContent).toContain("Sign out"),
    );
  });

  return { router, auth, writes, client, locks };
}

const until = (ready: () => void) =>
  act(async () => {
    await vi.waitFor(ready);
  });

test.each([0, 503, 401, 403, 404])(
  "a service refresh failure (%s) preserves the shell and draft without showing a second full-page state",
  async (status) => {
    const h = await mountWorkspace();
    await editTitle("Keep during refresh");
    const header = document.querySelector("header");
    const currentFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith(`/services/${pageIds.service}`)) {
        if (status === 0) throw new TypeError("Offline");

        return Response.json({}, { status });
      }

      return currentFetch(url, init);
    });
    await act(async () => {
      await h.client.refetchQueries({ queryKey: ["content", "service", pageIds.service] });
    });
    await until(() =>
      expect(h.client.getQueryState(["content", "service", pageIds.service])?.status).toBe("error"),
    );
    expect(document.querySelector("header")).toBe(header);
    expect(document.body.textContent).not.toContain("We could not load this service");

    if (status === 404) {
      await until(() =>
        expect(document.querySelector("#workspace-content h1")?.textContent).toBe(
          "Document not found",
        ),
      );
      expect(
        document.querySelector('textarea[aria-label="Page title"]')?.closest("[hidden]"),
      ).not.toBeNull();
    } else {
      expect(activeTitle().value).toBe("Keep during refresh");
      await until(() =>
        expect(document.body.textContent).toContain(
          status === 401
            ? "Your session has ended"
            : status === 403
              ? "You no longer have access to this service"
              : "We could not refresh this service",
        ),
      );
    }

    vi.mocked(fetch).mockImplementation(currentFetch);
    await act(async () => {
      await h.client.refetchQueries({ queryKey: ["content", "service", pageIds.service] });
    });
    await until(() => expect(activeTitle().value).toBe("Keep during refresh"));
  },
);

test.each([
  [["editor"], true],
  [["editor", "approver"], false],
])(
  "Delete page on a public page, for someone with roles %j, is held back with the reason: %s",
  async (roles, blocked) => {
    await mountWorkspace(`/services/${pageIds.service}/${pageIds.fees}`, {
      roles,
      publicIds: [pageIds.fees],
    });

    const deleteButton = () =>
      [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Delete page",
      )!;

    await until(() => expect(deleteButton().disabled).toBe(blocked));
    const reason = deleteButton().getAttribute("aria-describedby");
    expect(reason && document.getElementById(reason)?.textContent).toBe(
      blocked ? "Only approvers can delete a public page." : null,
    );
  },
);

test("someone without the editor role is told why, and can't add, delete or create", async () => {
  const h = await mountWorkspace(`/services/${pageIds.service}/${pageIds.fees}`, { roles: [] });

  const button = (name: string) =>
    [...document.querySelectorAll("button")].find((item) => item.textContent === name)!;

  await until(() => expect(document.body.textContent).toContain("you don’t have the editor role"));
  await until(() => expect(button("Delete page").disabled).toBe(true));
  expect(button("Add document").disabled).toBe(true);
  const reason = button("Add document").getAttribute("aria-describedby");
  expect(reason && document.getElementById(reason)?.textContent).toBe(
    "You need the editor role to add or delete pages.",
  );
  expect(button("Delete page").getAttribute("aria-describedby")).toBe(reason);

  await act(async () => {
    await h.router.navigate({ to: "/services" });
  });
  await until(() => expect(button("Create service").disabled).toBe(true));
});

test("an editor is offered adding and creating, with no read-only notice", async () => {
  await mountWorkspace(`/services/${pageIds.service}/${pageIds.fees}`, { roles: ["editor"] });

  const button = (name: string) =>
    [...document.querySelectorAll("button")].find((item) => item.textContent === name)!;

  await until(() => expect(button("Delete page").disabled).toBe(false));
  expect(button("Add document").disabled).toBe(false);
  expect(document.body.textContent).not.toContain("you don’t have the editor role");
});

test("malformed old workspaces and drafts cannot shadow API pages or create browser-only flows", async () => {
  localStorage.setItem("govbb-editor:workspace:v1", "{broken");
  localStorage.setItem("govbb-editor:documents:fees:markdown", "Old local page");
  localStorage.setItem("govbb-editor:draft:markdown:v2", "Old local form");
  const read = vi.spyOn(Storage.prototype, "getItem");
  const write = vi.spyOn(Storage.prototype, "setItem");
  await mountWorkspace();
  await until(() =>
    expect(document.querySelector('[aria-label="Page content"]')?.textContent).toContain(
      "Body of fees",
    ),
  );
  expect(document.body.textContent).not.toMatch(
    /Old local|Drafts in this browser|Create browser draft|Application form/,
  );
  expect(read.mock.calls.every(([key]) => key === "govbb-editor:sidebar-collapsed")).toBe(true);
  expect(write).not.toHaveBeenCalled();
});

test("old local URLs use normal API not-found behavior", async () => {
  localStorage.setItem(
    "govbb-editor:workspace:v1",
    JSON.stringify({
      version: 1,
      services: [{ id: "local", title: "Old service", documents: [] }],
    }),
  );
  await mountWorkspace("/services/local/form-original");
  await until(() => expect(document.body.textContent).toContain("Document not found"));
  expect(document.body.textContent).not.toContain("Old service");
});

const control = (label: string, scope: ParentNode = document) => {
  const button = [...scope.querySelectorAll("button")].find(
    (item) => shownText(item) === label || item.getAttribute("aria-label") === label,
  );

  if (!button) throw Error("Missing button: " + label);

  return button;
};

const activeTitle = () =>
  [...document.querySelectorAll<HTMLTextAreaElement>('textarea[aria-label="Page title"]')].find(
    (input) => !input.closest("[hidden]"),
  )!;

const question = () => document.querySelector<HTMLElement>('[role="alertdialog"]')!;

async function editTitle(value: string) {
  await act(async () => {
    const input = activeTitle();
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const click = (label: string, scope: ParentNode = document) =>
  act(async () => control(label, scope).click());

test("Cancel preserves route, edited title and focus; confirmed Leave cannot resurrect discarded edits or undo", async () => {
  const h = await mountWorkspace();
  await editTitle("Unsaved title");
  const ownership = h.locks.get(pageIds.fees)?.claim?.token;
  expect(ownership).toBeDefined();
  await act(async () => {
    void h.router.navigate({ to: "/services" });
  });
  await until(() => expect(question()?.textContent).toContain("Leave without saving?"));
  expect(h.router.state.location.pathname).toBe(`/services/${pageIds.service}/${pageIds.fees}`);
  await until(() => expect(document.activeElement).toBe(control("Cancel", question())));
  await click("Cancel", question());
  await until(() => expect(question()).toBeNull());
  expect(activeTitle().value).toBe("Unsaved title");
  expect(h.locks.get(pageIds.fees)?.claim?.token).toBe(ownership);
  expect(h.locks.get(pageIds.fees)?.requests.some((request) => request.method === "release")).toBe(
    false,
  );
  expect(h.writes).toHaveLength(0);
  await act(async () => {
    void h.router.navigate({ to: "/services" });
  });
  await until(() => expect(question()).not.toBeNull());
  await click("Leave without saving", question());
  await until(() => expect(h.router.state.location.pathname).toBe("/services"));
  await act(async () =>
    h.router.navigate({
      to: "/services/$serviceId/$documentId",
      params: { serviceId: pageIds.service, documentId: pageIds.fees },
    }),
  );
  await until(() => expect(activeTitle()?.value).toBe("fees"));
  expect(control("Undo").disabled).toBe(true);
});

test("sign-out asks before revoking auth and does not show a second route prompt", async () => {
  const h = await mountWorkspace();
  await editTitle("Keep before sign-out");
  await click("Sign out");
  await until(() => expect(question()?.textContent).toContain("Sign out?"));
  expect(h.auth.signOut).not.toHaveBeenCalled();
  await click("Cancel", question());
  expect(activeTitle().value).toBe("Keep before sign-out");
  await click("Sign out");
  await click("Sign out", question());
  await until(() => expect(h.router.state.location.pathname).toBe("/auth"));
  expect(h.auth.signOut).toHaveBeenCalledOnce();
  expect(question()).toBeNull();
  expect(document.body.textContent).not.toContain("remain in this browser");
});

test("failed sign-out and a cancelled session-expiry redirect keep the working copy", async () => {
  const h = await mountWorkspace();
  await editTitle("Keep on auth failure");
  const answer = Promise.withResolvers<Awaited<ReturnType<EditorAuth["signOut"]>>>();
  vi.mocked(h.auth.signOut).mockReturnValue(answer.promise);
  await click("Sign out");
  await click("Sign out", question());
  // While it works it keeps its colour and its place for the keyboard, rather than greying out
  await until(() => expect(control("Signing out…").hasAttribute("data-pending")).toBe(true));
  expect(control("Signing out…").disabled).toBe(false);
  await act(async () => answer.resolve({ ok: false, error: new AuthFailure("unavailable") }));
  await until(() => expect(document.body.textContent).toContain("We could not sign you out"));
  expect(control("Sign out").hasAttribute("data-pending")).toBe(false);
  expect(activeTitle().value).toBe("Keep on auth failure");
  vi.mocked(h.auth.session).mockResolvedValue({ ok: true, value: null });
  await act(async () => window.dispatchEvent(new Event("focus")));
  await until(() => expect(question()).not.toBeNull());
  await click("Cancel", question());
  expect(h.router.state.location.pathname).toBe(`/services/${pageIds.service}/${pageIds.fees}`);
  expect(activeTitle().value).toBe("Keep on auth failure");
  expect(h.auth.signIn).not.toHaveBeenCalled();
});

test("pending saves block departure but the navigation question can still be cancelled", async () => {
  const h = await mountWorkspace();
  await editTitle("Saving title");
  let complete: (response: Response) => void = () => {};

  const response = new Promise<Response>((resolve) => {
    complete = resolve;
  });

  const originalFetch = fetch;
  vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) =>
    init?.method === "PUT" ? response : originalFetch(url, init),
  );
  await click("Save");
  await act(async () => {
    void h.router.navigate({ to: "/services" });
  });
  await until(() => expect(question()?.textContent).toContain("A save is in progress"));
  expect(control("Leave without saving", question()).disabled).toBe(true);
  expect(control("Cancel", question()).disabled).toBe(false);
  await click("Cancel", question());
  expect(h.router.state.location.pathname).toBe(`/services/${pageIds.service}/${pageIds.fees}`);
  await act(async () => {
    complete(
      Response.json({
        ...pages.get("fees"),
        title: "Saving title",
        version: 2,
        updated_at: "2026-10-07T13:00:00.000Z",
      }),
    );
  });
  // Nothing left to save: unusable, though it keeps its place for the keyboard
  await until(() => expect(control("Save").getAttribute("aria-disabled")).toBe("true"));
});

test("clean navigation keeps at most three page views and retains API navigation", async () => {
  const h = await mountWorkspace();

  for (const documentId of ["other", "fourth", "service"] as const) {
    await act(async () =>
      h.router.navigate({
        to: "/services/$serviceId/$documentId",
        params: { serviceId: pageIds.service, documentId: pageIds[documentId] },
      }),
    );
    await until(() => expect(activeTitle()?.value).toBe(documentId));
    await until(() => expect(activeTitle().readOnly).toBe(false));

    for (const [id, lock] of h.locks) {
      if (id !== pageIds[documentId]) expect(lock.claim).toBeUndefined();
    }

    expect(document.querySelector('section[hidden] [contenteditable="true"]')).toBeNull();
    expect(question()).toBeNull();
  }

  expect(document.querySelectorAll("main > section[aria-label]").length).toBe(3);
  await act(async () =>
    h.router.navigate({
      to: "/services/$serviceId/$documentId",
      params: { serviceId: pageIds.service, documentId: pageIds.fees },
    }),
  );
  await until(() => expect(activeTitle()?.value).toBe("fees"));
  expect(question()).toBeNull();
});

const contacts = {
  key: "contacts",
  title: "Ministries and departments",
  record_key: "key",
  schema: { fields: [{ key: "key", label: "Key", type: "slug" }] },
  schema_version: 1,
  updated_at: "2026-10-07T12:00:00.000Z",
};

const menuLink = (name: string) =>
  [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Menu"] a')].find(
    (link) => link.textContent === name,
  );

test("the menu names the editor's screens, folded to icons beside a service's own pages", async () => {
  const h = await mountWorkspace();

  // Inside a service: a rail of icons, each still named, and the bar's way back to the list
  expect(menuLink("Services")?.getAttribute("aria-current")).toBe("page");
  expect(menuLink("Categories")?.querySelector(".sr-only")?.textContent).toBe("Categories");
  expect(document.querySelector('nav[aria-label="Service documents"]')).not.toBeNull();
  expect(document.querySelector("header a")?.textContent).toBe("Services");

  await act(async () => h.router.navigate({ to: "/categories" }));
  await until(() => expect(document.querySelector("h1")?.textContent).toBe("Categories"));

  // On a screen of its own: the whole column, its screen marked, and the bar's trail starting there
  expect(menuLink("Categories")?.getAttribute("aria-current")).toBe("page");
  expect(menuLink("Categories")?.querySelector(".sr-only")).toBeNull();
  expect(menuLink("Services")?.hasAttribute("aria-current")).toBe(false);
  expect(document.querySelector('nav[aria-label="Service documents"]')).toBeNull();
  expect(document.querySelector("header a")?.textContent).toBe("Categories");
  await until(() => expect(document.body.textContent).toContain("No categories yet"));
});

test("Collections is in the menu, and a record's dialog follows the address", async () => {
  const h = await mountWorkspace("/collections");

  await until(() => expect(document.querySelector("h1")?.textContent).toBe("Collections"));
  expect(menuLink("Collections")?.getAttribute("aria-current")).toBe("page");
  expect(document.querySelector("header a")?.textContent).toBe("Collections");

  await act(async () =>
    h.router.navigate({ to: "/collections/$key", params: { key: "contacts" } }),
  );
  await until(() =>
    expect(document.querySelector("h1")?.textContent).toBe("Ministries and departments"),
  );
  // Still the Collections screen in the menu, beside one of its collections
  expect(menuLink("Collections")?.getAttribute("aria-current")).toBe("page");

  // The address a page's contact block links to opens the record's dialog
  await act(async () =>
    h.router.navigate({
      to: "/collections/$key",
      params: { key: "contacts" },
      search: { record: "nis" },
    }),
  );
  await until(() =>
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Edit nis"),
  );

  // Closing it takes the record out of the address
  await act(async () =>
    [...document.querySelectorAll("button")].find((item) => item.textContent === "Cancel")!.click(),
  );
  await until(() => expect(h.router.state.location.search).toEqual({}));
  expect(h.router.state.location.pathname).toBe("/collections/contacts");
});

test("menu and bar links keep the focus as the screen changes and the menu folds or opens out", async () => {
  await mountWorkspace();

  // From a service, the rail's Categories opens out into the menu's row, still focused
  const categories = menuLink("Categories")!;

  categories.focus();
  await act(async () => categories.click());
  await until(() => expect(document.querySelector("h1")?.textContent).toBe("Categories"));
  expect(document.activeElement).toBe(categories);
  expect(categories.querySelector(".sr-only")).toBeNull();

  // The bar's trail starts with the same link, whichever screen it names
  const crumb = document.querySelector<HTMLAnchorElement>("header a")!;

  crumb.focus();
  await act(async () => menuLink("Services")!.click());
  await until(() => expect(document.querySelector("h1")?.textContent).toBe("Services"));
  expect(crumb.isConnected).toBe(true);
  expect(crumb.textContent).toBe("Services");
});
