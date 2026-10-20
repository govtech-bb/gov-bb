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
import { createEditorApi, type ServiceSummary } from "../../src/api/client";
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
  const client = new QueryClient();
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
  expect(html).toContain("Draft (hidden)");
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
  expect(host.querySelector('input[type="checkbox"]:checked')?.closest("label")?.textContent).toBe(
    "Preview link only",
  );

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

test("Clear filters clears the search words with the filters", async () => {
  const onSearch = vi.fn();

  await show(listed(thirty, { q: "hotel", status: ["draft"] }, { onSearch }));
  expect(host.textContent).toContain("Nothing matches these filters");

  await act(async () => button("Clear filters").click());

  expect(searchBox().value).toBe("");
  expect(titles()).toHaveLength(25);
  expect(onSearch).toHaveBeenLastCalledWith({
    page: undefined,
    q: undefined,
    category: undefined,
    status: undefined,
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
