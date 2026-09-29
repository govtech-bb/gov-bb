import { Agent, fetch, interceptors, type Dispatcher } from "undici";

/**
 * Reading api_v2, from landing_v2's server only.
 *
 * api_v2's CORS no longer admits this app (assumption 11), so a browser-side
 * call would fail anyway; every read goes through here, inside a server
 * function.
 *
 * Each read passes through an in-memory HTTP cache — undici's cache
 * interceptor in `shared` mode — so a normal page view does not reach api_v2,
 * let alone Postgres. api_v2's `Cache-Control` is the only place the
 * time-to-live is set: `public, max-age=60, stale-while-revalidate=300,
 * stale-if-error=86400` on the public reads. Within a minute a read is served
 * from memory; for five minutes after that the stale copy is served while a
 * background revalidation runs — undici starts one per stale read and does
 * not coalesce them, so N concurrent reads inside that window fire N
 * revalidations; and for a day a 500–504 from api_v2 is answered with the
 * stale copy instead. There is no `s-maxage` on purpose: in `shared` mode
 * undici reads it as proxy-revalidate and turns both stale directives off.
 *
 * Assumption (#2702): 6 — stale-if-error covers api_v2 answering 500–504
 * while a stale copy is being revalidated, not api_v2 being down. A refused
 * connection is an error, not a response, so it is the `unreachable` result
 * whether or not anything is cached. When nothing cached can be served, a
 * 5xx (`server_error`) and a refused connection (`unreachable`) both reach
 * the page as a 503 naming api_v2, with the status or the error code kept
 * in the message (pages.ts). A 200 whose body cannot be read — not JSON,
 * empty, cut off mid-stream, or stalled past the body timeout — is a
 * `server_error` too, and so also a 503 naming api_v2.
 * Assumption (#2702): 7 — the cache is in memory, one per process.
 *
 * The dispatcher also bounds how long it waits on api_v2: a hung upstream
 * (accepts the connection, never answers) would otherwise sit until
 * Amplify's 28s compute timeout fires and the citizen gets a 504 with no
 * body. Neither timeout is an error status, so stale-if-error cannot cover
 * either. The headers timeout fires before any response, so it is a
 * connection error — like a refused connection, it lands in the
 * `unreachable` branch above, which turns it into a fast 503 naming
 * `UND_ERR_HEADERS_TIMEOUT`. The body timeout fires after a 2xx's headers,
 * so it is a body that cannot be read: a `server_error`, and so also a fast
 * 503, naming `UND_ERR_BODY_TIMEOUT`.
 */

export type ApiResult =
  | { kind: "ok"; body: unknown }
  | { kind: "not_found" }
  // Any other non-2xx. A 4xx other than 404 would mean landing_v2 sent a
  // request api_v2 cannot answer, which is as much a failure to serve the
  // page as a 5xx. A 2xx whose body could not be read lands here too, with
  // the read or parse error as `cause`.
  | { kind: "server_error"; status: number; cause?: unknown }
  | { kind: "unreachable"; cause: unknown };

export interface ApiClient {
  apiGet(path: string): Promise<ApiResult>;
}

export interface CachingDispatcherOptions {
  /** How long to wait for api_v2's response headers before giving up. */
  headersTimeout?: number;
  /** How long to wait for the rest of api_v2's response body. */
  bodyTimeout?: number;
}

/**
 * An undici dispatcher with its own, empty, shared-mode HTTP cache.
 *
 * Both timeouts default to 5s, well under Amplify's 28s compute timeout, so
 * a hung api_v2 becomes a fast 503 instead of a slow 504 (see the comment
 * above). Production calls this with no arguments and gets the defaults;
 * tests pass shorter ones to exercise the timeout without waiting 5s.
 */
export function createCachingDispatcher({
  headersTimeout = 5_000,
  bodyTimeout = 5_000,
}: CachingDispatcherOptions = {}): Dispatcher {
  return new Agent({ headersTimeout, bodyTimeout }).compose(
    interceptors.cache({ type: "shared" }),
  );
}

/**
 * The one cache this process has. Tests pass their own dispatcher instead, so
 * each starts with an empty cache.
 */
const sharedDispatcher = createCachingDispatcher();

export function createApiClient(
  baseUrl: string,
  dispatcher: Dispatcher = sharedDispatcher,
): ApiClient {
  return {
    async apiGet(path) {
      let response;
      try {
        // undici's own `fetch`, not the global one: only it accepts this
        // dispatcher, and with it the cache.
        response = await fetch(`${baseUrl}${path}`, { dispatcher });
      } catch (cause) {
        return { kind: "unreachable", cause };
      }
      if (response.ok) {
        try {
          return { kind: "ok", body: await response.json() };
        } catch (cause) {
          return { kind: "server_error", status: response.status, cause };
        }
      }
      // Drain the body so the connection goes back to the pool.
      await response.body?.cancel();
      if (response.status === 404) return { kind: "not_found" };
      return { kind: "server_error", status: response.status };
    },
  };
}
