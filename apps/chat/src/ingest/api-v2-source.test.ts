import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chunkService } from "./chunker.ts";
import {
  catalogSchema,
  loadApiV2Content,
  pageSchema,
  startPageSchema,
} from "./api-v2-source.ts";

// Real responses captured from https://api-v2.sandbox.alpha.gov.bb (public,
// no preview token). They pin the api_v2 contract this ingest depends on.
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/api-v2/${name}`, import.meta.url), "utf8"),
  );

const BASE = "https://api-v2.test";
const CONDUCTOR = "/work-employment/apply-for-conductor-licence";
const ASSISTANCE = "/money-financial-support/apply-financial-assistance";

interface Call {
  url: string;
  init?: RequestInit;
}

// A fetch stub keyed on the request URL. Unlisted URLs answer 404, which is
// what api_v2 says for a page (or start step) it does not have.
type Routes = Record<string, { status: number; body?: unknown }>;

function stubFetch(routes: Routes) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url] ?? { status: 404, body: { error: "not_found" } };
    return new Response(
      route.body === undefined ? null : JSON.stringify(route.body),
      {
        status: route.status,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const pageUrl = (url: string) => `${BASE}/pages?url=${encodeURIComponent(url)}`;

const happyRoutes = (): Routes => ({
  [`${BASE}/catalog`]: { status: 200, body: fixture("catalog.json") },
  [pageUrl(CONDUCTOR)]: {
    status: 200,
    body: fixture("page-conductor-licence.json"),
  },
  [pageUrl(`${CONDUCTOR}/start`)]: {
    status: 200,
    body: fixture("start-conductor-licence.json"),
  },
  [pageUrl(ASSISTANCE)]: {
    status: 200,
    body: fixture("page-financial-assistance.json"),
  },
});

// --- contract: the api_v2 response shapes the ingest relies on ---------------

test("contract: captured api_v2 responses satisfy the ingest schemas", () => {
  assert.ok(catalogSchema.safeParse(fixture("catalog.json")).success);
  assert.ok(
    pageSchema.safeParse(fixture("page-conductor-licence.json")).success,
  );
  assert.ok(
    pageSchema.safeParse(fixture("page-financial-assistance.json")).success,
  );
  assert.ok(
    startPageSchema.safeParse(fixture("start-conductor-licence.json")).success,
  );
});

test("contract: /catalog parses loosely (extra fields from #3540 are fine)", () => {
  const parsed = catalogSchema.safeParse({
    pages: [
      {
        url: CONDUCTOR,
        title: "x",
        slug: "apply-for-conductor-licence",
        category: "work-employment",
        subcategory: null,
        form_id: "apply-for-conductor-licence",
        visibility: "public",
      },
    ],
    total: 1,
  });
  assert.ok(parsed.success);
});

test("contract: a page without body_markdown or a title is rejected", () => {
  const page = fixture("page-conductor-licence.json") as Record<
    string,
    unknown
  >;
  const { body_markdown: _b, ...noBody } = page;
  assert.equal(pageSchema.safeParse(noBody).success, false);
  assert.equal(
    pageSchema.safeParse({ ...page, frontmatter: {} }).success,
    false,
  );
});

// --- loadApiV2Content ---------------------------------------------------------

test("reads /catalog, then /pages per url and the /start probe", async () => {
  const { fetchImpl, calls } = stubFetch(happyRoutes());
  const services = await loadApiV2Content(BASE, fetchImpl);

  assert.deepEqual(
    calls.map((c) => c.url),
    [
      `${BASE}/catalog`,
      pageUrl(CONDUCTOR),
      pageUrl(`${CONDUCTOR}/start`),
      pageUrl(ASSISTANCE),
      pageUrl(`${ASSISTANCE}/start`),
    ],
  );
  // A redirect (a bare slug answers 301) must surface as a failure, not be
  // followed silently.
  for (const c of calls) assert.equal(c.init?.redirect, "manual");
  assert.equal(services.length, 2);
});

test("maps a page to a service: slug from the url, metadata from the response", async () => {
  const { fetchImpl } = stubFetch(happyRoutes());
  const [conductor, assistance] = await loadApiV2Content(BASE, fetchImpl);

  assert.equal(conductor.slug, "work-employment/apply-for-conductor-licence");
  assert.equal(conductor.title, "Apply for a conductor's licence");
  assert.match(conductor.description ?? "", /conductor's licence/);
  assert.equal(conductor.category, "work-employment");
  assert.equal(conductor.subcategory, undefined);
  assert.equal(conductor.form_id, "apply-for-conductor-licence");
  assert.equal(conductor.visibility, "public");
  assert.equal(conductor.stage, "alpha");
  assert.equal(conductor.service_type, "digital");
  assert.equal(conductor.publish_date, "2026-03-06");

  // A page with no form has form_id null in api_v2 → no formId downstream.
  assert.equal(assistance.form_id, undefined);
  assert.equal(assistance.hasStartPage, undefined);
});

test("folds the start step into the entry page, with the start link stripped", async () => {
  const { fetchImpl } = stubFetch(happyRoutes());
  const [conductor, assistance] = await loadApiV2Content(BASE, fetchImpl);

  assert.equal(conductor.hasStartPage, true);
  assert.match(
    conductor.body,
    /\n\n## Before you start\n\nYou should complete/,
  );
  assert.match(conductor.body, /### What you will need/);
  // Only the start step's anchor is stripped; the entry page body is kept as
  // written, as load.ts does for the markdown.
  const startSection = conductor.body.split("## Before you start")[1];
  assert.doesNotMatch(startSection, /data-start-link/);
  assert.doesNotMatch(startSection, /Start now/);

  // 404 on the start probe = no start step.
  assert.doesNotMatch(assistance.body, /Before you start/);
});

test("a trailing slash on the base url is tolerated", async () => {
  const { fetchImpl, calls } = stubFetch(happyRoutes());
  await loadApiV2Content(`${BASE}/`, fetchImpl);
  assert.equal(calls[0].url, `${BASE}/catalog`);
});

test("ids and urls come from the api_v2 url", async () => {
  const { fetchImpl } = stubFetch(happyRoutes());
  const [conductor] = await loadApiV2Content(BASE, fetchImpl);
  const { document } = chunkService(conductor);
  assert.equal(document.id, `service-${CONDUCTOR.slice(1)}`);
  assert.equal(document.url, `https://alpha.gov.bb${CONDUCTOR}`);
  assert.equal(document.metadata.status, "public");
  assert.equal(document.metadata.formId, "apply-for-conductor-licence");
  assert.equal(document.metadata.hasStartPage, true);
});

// --- failure modes: every one fails the run (no fallback to markdown) --------

test("fails when /catalog is not a 200", async () => {
  const routes = happyRoutes();
  routes[`${BASE}/catalog`] = { status: 503 };
  const { fetchImpl } = stubFetch(routes);
  await assert.rejects(loadApiV2Content(BASE, fetchImpl), /catalog.*503/);
});

test("fails when /catalog lists no pages (would otherwise prune everything)", async () => {
  const routes = happyRoutes();
  routes[`${BASE}/catalog`] = { status: 200, body: { pages: [] } };
  const { fetchImpl } = stubFetch(routes);
  await assert.rejects(loadApiV2Content(BASE, fetchImpl), /no pages/);
});

test("fails when /catalog has an unexpected shape", async () => {
  const routes = happyRoutes();
  routes[`${BASE}/catalog`] = { status: 200, body: { items: [] } };
  const { fetchImpl } = stubFetch(routes);
  await assert.rejects(loadApiV2Content(BASE, fetchImpl), /catalog/);
});

test("fails when a catalogued page answers 404", async () => {
  const routes = happyRoutes();
  delete routes[pageUrl(ASSISTANCE)];
  const { fetchImpl } = stubFetch(routes);
  await assert.rejects(loadApiV2Content(BASE, fetchImpl), /404/);
});

test("fails on a redirect instead of following it", async () => {
  const routes = happyRoutes();
  routes[pageUrl(CONDUCTOR)] = { status: 301 };
  const { fetchImpl } = stubFetch(routes);
  await assert.rejects(loadApiV2Content(BASE, fetchImpl), /301/);
});

test("fails when the start probe errors (only 404 means no start step)", async () => {
  const routes = happyRoutes();
  routes[pageUrl(`${CONDUCTOR}/start`)] = { status: 500 };
  const { fetchImpl } = stubFetch(routes);
  await assert.rejects(loadApiV2Content(BASE, fetchImpl), /start.*500/);
});

test("fails when a page response is malformed", async () => {
  const routes = happyRoutes();
  routes[pageUrl(ASSISTANCE)] = { status: 200, body: { url: ASSISTANCE } };
  const { fetchImpl } = stubFetch(routes);
  await assert.rejects(loadApiV2Content(BASE, fetchImpl), /apply-financial/);
});

test("fails, naming the url, when a 200 is not JSON", async () => {
  const routes = happyRoutes();
  const fetchImpl = (async (input: string | URL) =>
    String(input) === `${BASE}/catalog`
      ? new Response("<html>proxy error</html>", { status: 200 })
      : stubFetch(routes).fetchImpl(input)) as typeof fetch;
  await assert.rejects(
    loadApiV2Content(BASE, fetchImpl),
    /catalog returned invalid JSON/,
  );
});

test("a shape error names the failing field", async () => {
  const routes = happyRoutes();
  const page = fixture("page-financial-assistance.json") as object;
  routes[pageUrl(ASSISTANCE)] = {
    status: 200,
    body: { ...page, frontmatter: {} },
  };
  const { fetchImpl } = stubFetch(routes);
  await assert.rejects(loadApiV2Content(BASE, fetchImpl), /frontmatter\.title/);
});

test("fails when the network call itself throws", async () => {
  const fetchImpl = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  await assert.rejects(loadApiV2Content(BASE, fetchImpl), /fetch failed/);
});
