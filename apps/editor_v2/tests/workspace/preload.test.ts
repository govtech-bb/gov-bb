import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import {
  createEditorApi,
  type ServiceDetail,
  type ServicePage,
  type ServiceSummary,
} from "../../src/api/client";
import { pageQuery, serviceQuery, servicesQuery } from "../../src/api/queries";
import { primePage, primeService } from "../../src/workspace/preload";

const api = createEditorApi("http://localhost:3020");

const summary: ServiceSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "/family/birth-certificate",
  title: "Get a copy of a birth certificate",
  category: { slug: "family", title: "Family" },
  visibility: "public",
  form_id: null,
  has_start_page: false,
  page_count: 2,
  updated_at: "2026-10-01T09:00:00.000Z",
};

const fees = "55555552-5555-4555-8555-555555555552";

const servicePage = (id: string, parent: string | null, title: string): ServicePage => ({
  id,
  parent_id: parent,
  role: parent ? "supporting" : "entry",
  url: `${summary.url}/${id}`,
  slug: id,
  title,
  visibility: "public",
  form_id: null,
  updated_at: summary.updated_at,
});

const detail: ServiceDetail = {
  service: summary,
  pages: [servicePage(summary.id, null, summary.title), servicePage(fees, summary.id, "Fees")],
};

// The API's answers, and the paths asked for
const asked: string[] = [];

const answer = (path: string) =>
  path === "/editor/categories"
    ? { categories: [] }
    : path.startsWith("/services/")
      ? detail
      : {
          ...servicePage(path.replace("/pages/", ""), summary.id, "Fees"),
          version: 1,
          category_id: null,
          description: null,
          body_markdown: "Fees",
          frontmatter: {},
          published_at: null,
          created_at: summary.updated_at,
          pending_revision: null,
        };

afterEach(() => {
  asked.length = 0;
  vi.unstubAllGlobals();
});

const stubApi = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      asked.push(path);

      return new Response(JSON.stringify(answer(path)));
    }),
  );

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a service the services list shows starts loading, with its entry page", async () => {
  stubApi();
  const client = new QueryClient();
  client.setQueryData(servicesQuery(api).queryKey, [summary]);

  primeService(client, api, summary.id);
  primePage(client, api, summary.id, summary.id);
  await settled();

  expect(asked.toSorted()).toEqual([
    "/editor/categories",
    `/pages/${summary.id}`,
    `/services/${summary.id}`,
  ]);
  expect(client.getQueryData(serviceQuery(api, summary.id).queryKey)).toEqual(detail);
});

test("a service drafted in this browser never asks the content API", async () => {
  stubApi();
  const client = new QueryClient();
  client.setQueryData(servicesQuery(api).queryKey, [summary]);

  primeService(client, api, "existing-original");
  primePage(client, api, "existing-original", "form-original");
  // Nor does a form this browser drafts for an API service, which isn't one of its pages
  client.setQueryData(serviceQuery(api, summary.id).queryKey, detail);
  primePage(client, api, summary.id, "form-original");
  await settled();

  expect(asked).toEqual([]);
});

test("a page of a loaded service starts loading, unless it was fetched just now", async () => {
  stubApi();
  const client = new QueryClient();
  client.setQueryData(serviceQuery(api, summary.id).queryKey, detail);

  primePage(client, api, summary.id, fees);
  await settled();
  expect(asked).toEqual([`/pages/${fees}`, "/editor/categories"]);

  primeService(client, api, summary.id);
  primePage(client, api, summary.id, fees);
  await settled();
  expect(asked).toEqual([`/pages/${fees}`, "/editor/categories"]);
  expect(client.getQueryData(pageQuery(api, fees).queryKey)).toMatchObject({
    id: fees,
    version: 1,
  });
});
