// api_v2 content source for the ingest (#3252). Used when API_V2_URL is set;
// otherwise the CLI keeps reading the landing markdown via @govtech-bb/content.
//
//   GET /catalog                → the public page list ({ pages: [{ url }] })
//   GET /pages?url=<url>        → one page; body_markdown feeds the chunker
//   GET /pages?url=<url>/start  → the start step, folded into the entry page
//                                 (404 = no start step, or hidden)
//
// No preview token is sent, so api_v2 applies visibility server-side and
// returns public pages only. Every read must be a 200 (or a 404 on the start
// probe); anything else throws so the run fails and the last snapshot stays.
// There is deliberately no fallback to the markdown.

import type { ServiceEntity } from "@govtech-bb/content";
import { z } from "zod";

// Loose: /catalog is gaining fields (#3540); only `url` is relied on.
export const catalogSchema = z.looseObject({
  pages: z.array(z.looseObject({ url: z.string().startsWith("/") })),
});

// Metadata-only enums fall back to undefined on an unknown value rather than
// failing the run; the fields the chunker needs (title, body) are required.
export const pageSchema = z.looseObject({
  url: z.string().startsWith("/"),
  frontmatter: z.looseObject({
    title: z.string().min(1),
    description: z.string().nullish(),
    source_url: z.string().nullish(),
    stage: z.enum(["alpha"]).optional().catch(undefined),
    service_type: z
      .enum(["digital", "information"])
      .optional()
      .catch(undefined),
  }),
  body_markdown: z.string(),
  form_id: z.string().nullish(),
  category: z.string().nullish(),
  subcategory: z.string().nullish(),
  visibility: z.enum(["public", "preview", "draft"]).nullish(),
  published_at: z.string().nullish(),
});

export const startPageSchema = z.looseObject({ body_markdown: z.string() });

// Same as packages/content/src/load.ts: the landing "Start now" anchor is
// baked client-side from form_id; in plain markdown it's a dangling tag.
const START_LINK_RE = /<a[^>]*data-start-link[^>]*>.*?<\/a>/g;

const REQUEST_TIMEOUT_MS = 30_000;

// GET a JSON route. Returns null on a 404 when `allowNotFound`; throws on any
// other non-200 (a redirect included — a bare slug answers 301).
async function getJson(
  fetchImpl: typeof fetch,
  url: string,
  allowNotFound = false,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    redirect: "manual",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404 && allowNotFound) return null;
  if (res.status !== 200) {
    throw new Error(`api_v2 GET ${url} answered ${res.status}`);
  }
  return res.json();
}

function parse<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `api_v2 ${what}: unexpected response shape: ${parsed.error.issues[0]?.message}`,
    );
  }
  return parsed.data;
}

function toService(
  page: z.infer<typeof pageSchema>,
  startBody: string | null,
  source: string,
): ServiceEntity {
  const fm = page.frontmatter;
  let body = page.body_markdown.trim();
  const start = startBody?.replace(START_LINK_RE, "").trim();
  if (start) {
    // A synthetic heading keeps the start step's lead-in prose from bleeding
    // into whatever section ends the entry page (as load.ts does).
    body = `${body}\n\n## Before you start\n\n${start}`;
  }
  return {
    title: fm.title,
    description: fm.description ?? undefined,
    source_url: fm.source_url ?? undefined,
    stage: fm.stage,
    service_type: fm.service_type,
    category: page.category ?? undefined,
    subcategory: page.subcategory ?? undefined,
    form_id: page.form_id || undefined,
    visibility: page.visibility ?? "public",
    publish_date: page.published_at?.slice(0, 10),
    forms: [],
    // The api_v2 url without its leading slash: the chunker's document id
    // (`service-<slug>`) and canonical landing path both derive from it.
    slug: page.url.slice(1),
    body,
    filePath: source,
    ...(startBody !== null ? { hasStartPage: true } : {}),
  };
}

export async function loadApiV2Content(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceEntity[]> {
  const base = baseUrl.replace(/\/+$/, "");
  const pageRoute = (url: string) =>
    `${base}/pages?url=${encodeURIComponent(url)}`;

  const catalog = parse(
    catalogSchema,
    await getJson(fetchImpl, `${base}/catalog`),
    "/catalog",
  );
  if (catalog.pages.length === 0) {
    // An empty catalog would make the reconcile prune the whole index.
    throw new Error(`api_v2 /catalog at ${base} lists no pages`);
  }

  const services: ServiceEntity[] = [];
  for (const { url } of catalog.pages) {
    const source = pageRoute(url);
    const page = parse(pageSchema, await getJson(fetchImpl, source), url);
    const startRaw = await getJson(fetchImpl, pageRoute(`${url}/start`), true);
    const startBody =
      startRaw === null
        ? null
        : parse(startPageSchema, startRaw, `${url}/start`).body_markdown;
    services.push(toService(page, startBody, source));
  }
  return services;
}
