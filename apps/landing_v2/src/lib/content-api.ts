import { createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import type {
  PageResponse,
  RedirectBody,
} from '@govtech-bb/landing-v2-contract'
import { resolveCachedValue } from './cached-resolver'
import type { CachedEntry } from './cached-resolver'

/**
 * Server-side page fetch from the content API (`GET /pages?url=…`), behind a
 * per-URL, per-instance cache with v1's freshness/retry/last-known-good rules
 * (`cached-resolver.ts`). The browser never calls the API: the route loader
 * reaches it through the `getPage` server function, and the API base URL is a
 * server-only env var read per call.
 */

const FETCH_TIMEOUT_MS = 15_000

/** How long a fetched result is served before the next request refetches it. */
const TTL_MS = 60_000

/** Extra fetch attempts for a URL with no cached result yet. */
const COLD_START_RETRIES = 3

export type PageResult =
  | { kind: 'page'; page: PageResponse }
  | { kind: 'redirect'; to: string }
  | { kind: 'not-found' }
  | { kind: 'unavailable' }

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    // `manual`: a 301 carries the canonical path; following it would hit the
    // API origin, not the site.
    return await fetch(url, { redirect: 'manual', signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch one page and map the API's answer. A 404 is a result, not a failure —
 * throwing on it would turn an unknown URL into a 503 during an outage and keep
 * serving a cached page after it is unpublished. Anything else (another status,
 * a network error, invalid JSON, no base URL) throws: that is what the cache
 * treats as "API down".
 */
export async function fetchPage(url: string): Promise<PageResult> {
  // No VITE_ prefix, read per call: Vite never inlines it into the client.
  const base = process.env.CONTENT_API_URL
  if (!base) throw new Error('CONTENT_API_URL is not set')

  const response = await fetchWithTimeout(
    `${base}/pages?url=${encodeURIComponent(url)}`,
    FETCH_TIMEOUT_MS,
  )
  if (response.status === 200) {
    return { kind: 'page', page: (await response.json()) as PageResponse }
  }
  if (response.status === 301) {
    const body = (await response.json()) as RedirectBody
    return { kind: 'redirect', to: body.redirect }
  }
  if (response.status === 404) return { kind: 'not-found' }
  throw new Error(`HTTP ${response.status} ${response.statusText}`)
}

/**
 * Resolve a page through the cache, keyed by the URL with leading/trailing
 * slashes trimmed. Every result kind is cached alike, so a 404 or 301 is also
 * remembered for the TTL. A cold miss whose retries all fail yields
 * `unavailable`. `now`, the `fetcher`, the `cache` and `sleep` are injected so
 * this can be tested without the network or timers.
 */
export function resolvePage({
  url,
  now,
  fetcher,
  cache,
  sleep,
}: {
  url: string
  now: number
  fetcher: (url: string) => Promise<PageResult>
  cache: Map<string, CachedEntry<PageResult>>
  sleep?: (ms: number) => Promise<void>
}): Promise<PageResult> {
  const key = url.replace(/^\/+|\/+$/g, '')
  return resolveCachedValue<PageResult>({
    now,
    ttlMs: TTL_MS,
    fetcher: () => fetcher(key),
    getCached: () => cache.get(key) ?? null,
    setCached: (entry) => {
      cache.set(key, entry)
    },
    emptyValue: { kind: 'unavailable' },
    coldStartRetries: COLD_START_RETRIES,
    sleep,
    onFetchFailure: (err) => {
      console.warn(
        `[content-api] could not fetch "${key}" and have no cached copy — ` +
          `serving 503. Cause: ${err instanceof Error ? err.message : String(err)}`,
      )
    },
  })
}

/** Per-instance cache, shared across requests served by this server process. */
const pageCache = new Map<string, CachedEntry<PageResult>>()

/**
 * Server function returning the page result for a site path. An `unavailable`
 * result sets the response status to 503 here (server-only); `src/start.ts`
 * makes that status survive the router's own 500 for the thrown error.
 */
export const getPage = createServerFn({ method: 'GET' })
  .validator((url: string) => url)
  .handler(async ({ data }): Promise<PageResult> => {
    const result = await resolvePage({
      url: data,
      now: Date.now(),
      fetcher: fetchPage,
      cache: pageCache,
    })
    if (result.kind === 'unavailable') setResponseStatus(503)
    return result
  })
