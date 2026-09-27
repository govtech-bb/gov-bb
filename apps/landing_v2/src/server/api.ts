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
 * from memory; for five minutes after that the stale copy is served while one
 * background request refreshes it; and for a day a 500–504 from api_v2 is
 * answered with the stale copy instead. There is no `s-maxage` on purpose: in
 * `shared` mode undici reads it as proxy-revalidate and turns both stale
 * directives off.
 *
 * Assumption (#2702): 6 — stale-if-error covers api_v2 answering 500–504,
 * not api_v2 being down. A refused connection is an error, not a response,
 * so it is the `unreachable` result whether or not anything is cached.
 * Assumption (#2702): 7 — the cache is in memory, one per process.
 */

export type ApiResult =
  | { kind: "ok"; body: unknown }
  | { kind: "not_found" }
  // Any other non-2xx. A 4xx other than 404 would mean landing_v2 sent a
  // request api_v2 cannot answer, which is as much a failure to serve the
  // page as a 5xx.
  | { kind: "server_error"; status: number }
  | { kind: "unreachable"; cause: unknown };

export interface ApiClient {
  apiGet(path: string): Promise<ApiResult>;
}

/** An undici dispatcher with its own, empty, shared-mode HTTP cache. */
export function createCachingDispatcher(): Dispatcher {
  return new Agent().compose(interceptors.cache({ type: "shared" }));
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
      if (response.ok) return { kind: "ok", body: await response.json() };
      // Drain the body so the connection goes back to the pool.
      await response.body?.cancel();
      if (response.status === 404) return { kind: "not_found" };
      return { kind: "server_error", status: response.status };
    },
  };
}
