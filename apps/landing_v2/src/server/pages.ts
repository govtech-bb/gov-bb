import {
  collectionsFor,
  pageDocumentSchema,
  type PageDocument,
} from "@govtech-bb/block-kit/document";
import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { createApiClient, type ApiClient, type ApiResult } from "./api";
import { apiV2Url, formsUrl } from "./config";

/**
 * A page and everything its blocks read, fetched from api_v2 on the server.
 *
 * The route loaders call only `getPage` and `listPages`. They are server
 * functions, so on the first request they run in-process during SSR, and on
 * a client-side navigation the browser calls landing_v2's own server, which
 * calls api_v2. The browser never calls api_v2, and the Start compiler strips
 * the handlers — and with them api.ts, config.ts and undici — from the client
 * build.
 *
 * `loadPage` and `loadIndex` hold the logic as plain functions of an
 * `ApiClient`, so the tests can run them against a throwaway server.
 */

type Records = Array<Record<string, unknown>>;

export interface LoadedPage {
  doc: PageDocument;
  data: Record<string, Records>;
}

/** One row of `GET /pages`, for the index. */
export interface PageSummary {
  id: string;
  url: string;
  title: string;
  schema_name: string;
  document_type: string;
  updated_at: string;
}

/**
 * api_v2 could not serve a read: it could not be reached at all (a refused
 * connection, a DNS failure), it answered an error status with nothing
 * cached to serve instead — the database down behind a running api_v2 is a
 * 500 — or it answered with a body that could not be read. The server
 * functions answer any of these with a 503.
 */
export class ApiUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiUnavailableError";
  }
}

/** The body of an ok result; anything else as the error it is. */
function bodyOf(result: ApiResult, what: string): unknown {
  switch (result.kind) {
    case "ok":
      return result.body;
    case "unreachable": {
      // The error code, not the message: the message carries api_v2's host,
      // and this is rendered on the page.
      const code = (result.cause as { cause?: { code?: unknown } }).cause?.code;
      throw new ApiUnavailableError(
        `api_v2 could not be reached${code ? ` (${String(code)})` : ""}.`,
        { cause: result.cause },
      );
    }
    case "not_found":
      throw new Error(`api_v2 has no ${what}.`);
    case "server_error":
      // The undici error code of a read that failed (a body timeout, a
      // cut-off socket), but not the cause's own message: this is rendered
      // on the page, and a JSON parse error quotes part of the body.
      if ("cause" in result) {
        const code = (result.cause as { cause?: { code?: unknown } }).cause
          ?.code;
        throw new ApiUnavailableError(
          `api_v2 answered ${result.status} for ${what} with a body that could not be read${code ? ` (${String(code)})` : ""}.`,
          { cause: result.cause },
        );
      }
      throw new ApiUnavailableError(
        `api_v2 answered ${result.status} for ${what}.`,
      );
  }
}

/**
 * The page at `url` and the records of every collection it reads, or null
 * when api_v2 has no published page there.
 *
 * The document is validated before anything renders it. The collections are
 * fetched in parallel, and only the ones this page reads — a prose page
 * fetches nothing beyond itself.
 */
export async function loadPage(
  url: string,
  client: ApiClient,
): Promise<LoadedPage | null> {
  const result = await client.apiGet(
    `/pages/by-url?url=${encodeURIComponent(url)}`,
  );
  if (result.kind === "not_found") return null;

  const body = bodyOf(result, `page at ${url}`);
  const parsed = pageDocumentSchema.safeParse(body);
  if (!parsed.success) {
    // Assumption (#2702): 14 — named in full, slug and field path, because
    // this is a spike and the message is shown on the page.
    const slug = (body as { slug?: unknown } | null)?.slug ?? url;
    const fields = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `Page "${String(slug)}" from api_v2 is not a valid page document — ${fields}`,
    );
  }
  const doc = parsed.data as PageDocument;

  const entries = await Promise.all(
    collectionsFor(doc).map(async (key) => {
      const records = await client.apiGet(
        `/collections/${encodeURIComponent(key)}/records`,
      );
      return [key, bodyOf(records, `collection ${key}`) as Records] as const;
    }),
  );
  return { doc, data: Object.fromEntries(entries) };
}

/** Every published page, for the index. */
export async function loadIndex(client: ApiClient): Promise<PageSummary[]> {
  return bodyOf(await client.apiGet("/pages"), "page list") as PageSummary[];
}

/** Runs a load, answering 503 when api_v2 could not serve it. */
async function withUnavailableStatus<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    // Assumption (#2702): 14 — an unreachable or failing api_v2 is a 503, not
    // the 500 a malformed document is.
    if (error instanceof ApiUnavailableError) setResponseStatus(503);
    throw error;
  }
}

// `strict.output` off: a document's query `where` values and every record
// are `unknown` in their types, which the serialisability check rejects, but
// they came from `response.json()`, so they are JSON by construction.
export const getPage = createServerFn({
  method: "GET",
  strict: { output: false },
})
  // Untrusted input: this RPC is public and reachable directly.
  .validator((url: unknown) => {
    if (typeof url !== "string") throw new Error("url must be a string");
    return url;
  })
  .handler(async ({ data: url }) => {
    const page = await withUnavailableStatus(() =>
      loadPage(url, createApiClient(apiV2Url())),
    );
    return page && { ...page, formsUrl: formsUrl() };
  });

export const listPages = createServerFn({ method: "GET" }).handler(() =>
  withUnavailableStatus(() => loadIndex(createApiClient(apiV2Url()))),
);
