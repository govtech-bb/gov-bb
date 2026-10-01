import type { Root } from "hast";
import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { createApiClient, type ApiClient, type ApiResult } from "./api";
import { apiV2Url, formsUrl } from "./config";

/**
 * A page, fetched from api_v2 on the server.
 *
 * The route loader calls only `getPage`. It is a server function, so on the
 * first request it runs in-process during SSR, and on a client-side
 * navigation the browser calls landing_v2's own server, which calls api_v2.
 * The browser never calls api_v2, and the Start compiler strips the handler —
 * and with it api.ts, config.ts and undici — from the client build.
 *
 * `loadPage` holds the logic as a plain function of an `ApiClient`, so the
 * tests can run it against a throwaway server.
 */

/** `GET /pages?url=`: everything api_v2 decided a citizen may see. */
export interface PageResponse {
  url: string;
  frontmatter: { title: string; description?: string; lede?: string };
  hast: Root;
  /** The full trail, current page included, Home not. */
  breadcrumbs: Array<{ name: string; url: string }>;
}

export type LoadedPage =
  | { kind: "page"; page: PageResponse }
  | { kind: "redirect"; url: string };

/**
 * api_v2 could not serve a read: it could not be reached at all (a refused
 * connection, a DNS failure), or it answered an error status with nothing
 * cached to serve instead — the database down behind a running api_v2 is a
 * 500. The server functions answer either with a 503.
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
    case "redirect":
    case "not_found":
      throw new Error(`api_v2 has no ${what}.`);
    case "server_error":
      throw new ApiUnavailableError(
        `api_v2 answered ${result.status} for ${what}.`,
      );
  }
}

/** The first field of `body` that is not a page response, or null. */
function malformedField(body: unknown): string | null {
  const page = body as Partial<PageResponse> | null;
  if (typeof page?.url !== "string") return "url";
  if (typeof page.frontmatter?.title !== "string") return "frontmatter.title";
  if (page.hast?.type !== "root" || !Array.isArray(page.hast.children)) {
    return "hast";
  }
  if (!Array.isArray(page.breadcrumbs)) return "breadcrumbs";
  return null;
}

/**
 * The page at `url`, a redirect to its canonical url, or null when api_v2
 * has no public page there.
 *
 * The response is checked before anything renders it; api_v2 has already
 * sanitised the hast and removed any Start link that leads nowhere public.
 */
export async function loadPage(
  url: string,
  client: ApiClient,
): Promise<LoadedPage | null> {
  const result = await client.apiGet(`/pages?url=${encodeURIComponent(url)}`);
  if (result.kind === "not_found") return null;
  if (result.kind === "redirect") {
    return { kind: "redirect", url: result.location };
  }

  const body = bodyOf(result, `page at ${url}`);
  const field = malformedField(body);
  if (field) {
    // Assumption (#2702): 14 — named in full, url and field, because this is
    // a spike and the message is shown on the page.
    throw new Error(
      `Page "${url}" from api_v2 is not a valid page response — ${field}`,
    );
  }
  return { kind: "page", page: body as PageResponse };
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

// `strict.output` off: a hast node's `properties` and `data` are open
// records the serialisability check rejects, but they came from
// `response.json()`, so they are JSON by construction.
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
