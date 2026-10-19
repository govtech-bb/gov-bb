/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { afterEach, expect, test, vi } from "vitest";
import { createEditorApi, type ApiPage } from "../../src/api/client";
import { pageQuery, taxonomyQuery } from "../../src/api/queries";
import { RemotePagePane } from "../../src/workspace/remote-page-pane";
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
        <RemotePagePane api={api} id={page.id} active onStore={() => {}} />
      </QueryClientProvider>
    </RouterContextProvider>,
  );

  await vi.waitFor(() =>
    expect(document.querySelector('[aria-label="Page content"]')?.textContent).toContain(
      "What it costs.",
    ),
  );
});
