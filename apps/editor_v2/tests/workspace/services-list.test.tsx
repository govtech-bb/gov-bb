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
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiFailure, createEditorApi, type ServiceSummary } from "../../src/api/client";
import { servicesQuery } from "../../src/api/queries";
import { ServicesList } from "../../src/workspace/services-list";
import type { ServicesSearch } from "../../src/workspace/services-search";

const service = (n: number): ServiceSummary => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  url: `/business-trade/service-${n}`,
  title: `Service ${String(n).padStart(2, "0")}`,
  category: { slug: "business-trade", title: "Business and trade" },
  visibility: n % 2 ? "preview" : "public",
  form_id: n === 1 ? "service-one" : null,
  has_start_page: n === 1,
  page_count: n === 1 ? 2 : 1,
  updated_at: `2026-09-${String(n).padStart(2, "0")}T12:00:00.000Z`,
});

const thirty = Array.from({ length: 30 }, (_, i) => service(30 - i));

const rootRoute = createRootRoute();

const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/services/$serviceId/$documentId" }),
  ]),
  history: createMemoryHistory({ initialEntries: ["/services"] }),
});

const api = createEditorApi("http://localhost:3020", "https://alpha.gov.bb");

const listed = (
  services: ServiceSummary[],
  search: ServicesSearch,
  actions: { onSearch?: (search: ServicesSearch) => void; onCreate?: () => void } = {},
) => {
  // These list-interaction fixtures are already loaded; a real local API must not replace them mid-test.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(servicesQuery(api).queryKey, services);

  return (
    <RouterContextProvider router={router}>
      <QueryClientProvider client={client}>
        <ServicesList
          api={api}
          search={search}
          onSearch={actions.onSearch ?? (() => {})}
          onCreate={actions.onCreate ?? (() => {})}
        />
      </QueryClientProvider>
    </RouterContextProvider>
  );
};

test("lists API services newest change first, a page at a time, opening each in the editor", () => {
  const html = renderToStaticMarkup(listed(thirty, {}));

  const titles = [...html.matchAll(/>(Service \d\d)</g)].map(([, title]) => title);
  expect(titles).toHaveLength(25);
  expect(titles.slice(0, 3)).toEqual(["Service 30", "Service 29", "Service 28"]);
  expect(html).toContain("1–25 of 30");
  expect(html).toContain("30 services");
  expect(html).toContain(`href="/services/${service(30).id}/${service(30).id}"`);
  expect(html).toContain('href="https://alpha.gov.bb/business-trade/service-30"');
  expect(html).toContain("Preview link only");
  expect(html).toContain('aria-sort="descending"');
  expect(html).toContain("Search title or URL");
  expect(html).toContain("All categories");
  expect(html).toContain("All statuses");
});

let host: HTMLDivElement;

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const show = (node: ReturnType<typeof listed>) => act(async () => root.render(node));

const titles = () =>
  [...host.querySelectorAll("tbody a")].flatMap((link) =>
    link.textContent?.startsWith("Service") ? [link.textContent] : [],
  );

const searchBox = () => host.querySelector<HTMLInputElement>('input[type="search"]')!;

const button = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent === name || item.getAttribute("aria-label") === name,
  )!;

/** One of the toolbar's filters, by its name. */
const filter = (name: string) =>
  host.querySelector<HTMLElement>(`[role="combobox"][aria-label="${name}"]`)!;

/** Opens a filter's list, which renders in a portal outside the root, and picks one of its options. */
async function choose(name: string, option: string) {
  await act(async () => {
    filter(name).focus();
    filter(name).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((item) => item.textContent === option)!
      .click(),
  );
}

/** Types into the search box as a browser would: React reads the new value from the input event. */
const type = (words: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(searchBox(), words);
    searchBox().dispatchEvent(new Event("input", { bubbles: true }));
  });

test("it opens where its address puts it: searched, filtered, sorted and on its page", async () => {
  await show(listed(thirty, { status: ["preview"], sort: "title", order: "asc" }));

  expect(titles().slice(0, 3)).toEqual(["Service 01", "Service 03", "Service 05"]);
  expect(filter("Status").textContent).toBe("Preview link only");

  await act(async () => root.unmount());
  root = createRoot(host);
  await show(listed(thirty, { page: 2 }));
  expect(host.textContent).toContain("26–30 of 30");
  expect(titles()[0]).toBe("Service 05");

  await act(async () => root.unmount());
  root = createRoot(host);
  await show(listed(thirty, { q: "Service 0" }));
  expect(titles()).toHaveLength(9);
  expect(searchBox().value).toBe("Service 0");
});

test("each change shows at once and gives the address the new place; a new search starts on page 1", async () => {
  const onSearch = vi.fn();

  await show(listed(thirty, { page: 2 }, { onSearch }));
  expect(onSearch).toHaveBeenLastCalledWith({ page: 2 });

  await type("Service 1");
  // The words stay as typed, and the rows answer them before the address does
  expect(searchBox().value).toBe("Service 1");
  expect(titles()).toEqual([
    "Service 19",
    "Service 18",
    "Service 17",
    "Service 16",
    "Service 15",
    "Service 14",
    "Service 13",
    "Service 12",
    "Service 11",
    "Service 10",
  ]);
  expect(onSearch).toHaveBeenLastCalledWith({ page: undefined, q: "Service 1" });

  await type("");
  await act(async () => button("Page 2").click());
  expect(onSearch).toHaveBeenLastCalledWith({ page: 2, q: undefined, size: undefined });

  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>("th button")]
      .find((item) => item.textContent === "Service")!
      .click(),
  );
  expect(titles()[0]).toBe("Service 01");
  expect(onSearch).toHaveBeenLastCalledWith({
    page: undefined,
    q: undefined,
    size: undefined,
    sort: "title",
    order: "asc",
  });
});

test("with no matches, one Clear filters button clears the list and returns focus to search", async () => {
  const onSearch = vi.fn();

  await show(listed(thirty, { q: "hotel", status: ["draft"] }, { onSearch }));
  expect(host.textContent).toContain("Nothing matches these filters");

  const clearButtons = [...host.querySelectorAll<HTMLButtonElement>("button")].filter(
    (item) => item.textContent === "Clear filters",
  );

  expect(clearButtons).toHaveLength(1);
  await act(async () => {
    clearButtons[0]!.focus();
    clearButtons[0]!.click();
  });

  expect(searchBox().value).toBe("");
  expect(titles()).toHaveLength(25);
  expect(document.activeElement).toBe(searchBox());
  expect(onSearch).toHaveBeenLastCalledWith({
    page: undefined,
    q: undefined,
    category: undefined,
    status: undefined,
  });
});

test("the toolbar's filters narrow the list at once, and Clear filters shows every service again", async () => {
  const onSearch = vi.fn();

  await show(listed(thirty, {}, { onSearch }));
  expect(button("Clear filters")).toBeUndefined();

  await choose("Category", "Business and trade");
  expect(filter("Category").textContent).toBe("Business and trade");
  expect(onSearch).toHaveBeenLastCalledWith({
    page: undefined,
    category: "Business and trade",
    status: undefined,
  });

  // Several statuses can be shown at once, so their list stays open for another
  await choose("Status", "Preview link only");
  expect(titles()).toHaveLength(15);
  expect(titles().every((title) => Number(title.slice(-2)) % 2 === 1)).toBe(true);
  expect(onSearch).toHaveBeenLastCalledWith({
    page: undefined,
    category: "Business and trade",
    status: ["preview"],
  });

  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(filter("Status").getAttribute("aria-expanded")).toBe("false");
  await act(async () => button("Clear filters").click());

  expect(titles()).toHaveLength(25);
  expect(filter("Category").textContent).toBe("All categories");
  expect(filter("Status").textContent).toBe("All statuses");
  expect(button("Clear filters")).toBeUndefined();
  // The button went with the filters, so focus waits in the search box
  expect(document.activeElement).toBe(searchBox());
  expect(onSearch).toHaveBeenLastCalledWith({
    page: undefined,
    q: undefined,
    category: undefined,
    status: undefined,
  });
});

test("legacy drafts keep their hidden label, filter value and status sort order", async () => {
  const onSearch = vi.fn();
  await show(
    listed(
      [service(2), service(3), { ...service(1), visibility: "draft" }],
      { sort: "visibility", order: "asc" },
      { onSearch },
    ),
  );
  expect(titles()).toEqual(["Service 01", "Service 03", "Service 02"]);
  expect(host.textContent).toContain("Draft (hidden)");
  expect(host.textContent).not.toContain("Draft link only");

  await choose("Status", "Draft (hidden)");
  expect(titles()).toEqual(["Service 01"]);
  expect(filter("Status").textContent).toBe("Draft (hidden)");
  expect(onSearch).toHaveBeenLastCalledWith({
    sort: "visibility",
    order: "asc",
    page: undefined,
    category: undefined,
    status: ["draft"],
  });
});

test("an address past the last page shows the last page", async () => {
  const onSearch = vi.fn();

  await show(listed(thirty, { page: 4 }, { onSearch }));

  expect(host.textContent).toContain("26–30 of 30");
  expect(onSearch).toHaveBeenLastCalledWith({ page: 2, size: undefined });
});

test("with no services yet, it offers to create the first", async () => {
  const onCreate = vi.fn();

  await show(listed([], {}, { onCreate }));
  expect(host.textContent).toContain("No services yet");

  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>("tbody button")]
      .find((item) => item.textContent === "Create service")!
      .click(),
  );
  expect(onCreate).toHaveBeenCalled();
});

test("the first services load names its results region without replacing its controls", async () => {
  const held = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => held.promise),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await show(
    <RouterContextProvider router={router}>
      <QueryClientProvider client={client}>
        <ServicesList api={api} search={{}} onSearch={() => {}} onCreate={() => {}} />
      </QueryClientProvider>
    </RouterContextProvider>,
  );
  const heading = host.querySelector("h1");
  const status = host.querySelector('[role="status"]');
  expect(status?.textContent).toBe("Loading services…");
  // Outside the busy table, which would hold back its announcement
  expect(status?.closest('[aria-busy="true"]')).toBeNull();
  expect(searchBox()).not.toBeNull();
  expect(host.querySelector("table")?.getAttribute("aria-busy")).toBe("true");
  await act(async () => held.resolve(Response.json(thirty)));
  await act(async () => {
    await vi.waitFor(() => expect(titles()).toHaveLength(25));
  });
  expect(host.querySelector("h1")).toBe(heading);
  expect(host.textContent).not.toContain("Loading services…");
  // The same live region stays, emptied, ready for the next change
  expect(status?.isConnected).toBe(true);
  client.clear();
});

test.each([0, 503, 401, 403, 404])(
  "a services refresh failure (%s) is local, without presenting refused data as current",
  async (status) => {
    const held = Promise.withResolvers<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => held.promise),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });

    const query = servicesQuery(api);
    client.setQueryData(query.queryKey, thirty);
    await show(
      <RouterContextProvider router={router}>
        <QueryClientProvider client={client}>
          <ServicesList api={api} search={{}} onSearch={() => {}} onCreate={() => {}} />
        </QueryClientProvider>
      </RouterContextProvider>,
    );
    let refresh: Promise<void>;
    await act(async () => {
      refresh = client.refetchQueries({ queryKey: query.queryKey });
    });
    expect(titles()).toHaveLength(25);
    expect(host.textContent).not.toContain("Loading services…");
    await act(async () => {
      if (status === 0) held.reject(new TypeError("Offline"));
      else held.resolve(Response.json({}, { status }));
      await refresh;
    });
    await act(async () => {
      await vi.waitFor(() => expect(client.getQueryState(query.queryKey)?.status).toBe("error"));
    });

    if (status === 0 || status === 503) {
      await act(async () => {
        await vi.waitFor(() => expect(host.textContent).toContain("We could not refresh services"));
      });
      expect(titles()).toHaveLength(25);
      expect(host.textContent).toContain("We could not refresh services");
      expect(host.textContent).not.toContain("We could not load services");
    } else {
      await act(async () => {
        await vi.waitFor(() => expect(host.querySelector('[role="alert"]')).not.toBeNull());
      });
      expect(titles()).toHaveLength(0);
      expect(host.querySelector('[role="alert"]')).not.toBeNull();

      const alert = host.querySelector('[role="alert"]')!;

      if (status === 401) {
        const signIn = alert.querySelector("a");

        expect(alert.textContent).toContain(
          "Your session has ended. Sign in again to load services.",
        );
        expect(signIn?.textContent).toBe("Sign in again");

        const target = new URL(signIn!.getAttribute("href")!, "http://localhost");

        expect(target.pathname).toBe("/auth");
        expect(Object.fromEntries(target.searchParams)).toEqual({
          state: "sign-in",
          returnTo: "/services",
          reason: "provider",
        });
        expect(button("Try again")).toBeUndefined();
      } else if (status === 403) {
        expect(alert.textContent).toContain("You do not have access to these services.");
        expect(alert.querySelector("button")?.textContent).toBe("Try again");
      }
    }

    client.clear();
  },
);

test("a failed load is an alert with Try again", async () => {
  const failing = new QueryClient();
  failing.setQueryDefaults(servicesQuery(api).queryKey, { retryOnMount: false });
  failing
    .getQueryCache()
    .build(failing, { queryKey: servicesQuery(api).queryKey })
    .setState({ status: "error", error: new Error("Offline"), fetchStatus: "idle" });

  await show(
    <RouterContextProvider router={router}>
      <QueryClientProvider client={failing}>
        <ServicesList api={api} search={{}} onSearch={() => {}} onCreate={() => {}} />
      </QueryClientProvider>
    </RouterContextProvider>,
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("We could not load services");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Try again");
});

test("a failed load's Try again waits on its retry, so another press sends nothing", async () => {
  const retried = Promise.withResolvers<Response>();
  const send = vi.fn(() => retried.promise);
  vi.stubGlobal("fetch", send);

  // The list had loaded before the refusal, so the failure stays up while it's tried again. A failed first load goes
  // back to loading instead.
  const refused = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  refused
    .getQueryCache()
    .build(refused, { queryKey: servicesQuery(api).queryKey })
    .setState({ status: "error", data: thirty, error: new ApiFailure(403), fetchStatus: "idle" });

  await show(
    <RouterContextProvider router={router}>
      <QueryClientProvider client={refused}>
        <ServicesList api={api} search={{}} onSearch={() => {}} onCreate={() => {}} />
      </QueryClientProvider>
    </RouterContextProvider>,
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "You do not have access to these services.",
  );

  await act(async () => button("Try again").click());
  await act(async () => {
    await vi.waitFor(() => expect(button("Try again").getAttribute("aria-disabled")).toBe("true"));
  });
  await act(async () => button("Try again").click());
  expect(send).toHaveBeenCalledTimes(1);

  await act(async () => retried.resolve(Response.json(thirty)));
  await act(async () => {
    await vi.waitFor(() => expect(titles()).toHaveLength(25));
  });
  expect(host.querySelector('[role="alert"]')).toBeNull();
  refused.clear();
});
