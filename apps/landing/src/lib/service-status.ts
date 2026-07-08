import { createServerFn } from '@tanstack/react-start'
import { resolveCachedValue } from './cached-resolver'
import { FETCH_TIMEOUT_MS, fetchWithTimeout, formsApiBase } from './forms-api'

/**
 * Runtime resolution of the DB-driven service_status overrides (#1897).
 *
 * An admin can flip a service's status via `PUT /service_status` on the forms
 * API. This module fetches the current `GET /service_status` list and turns
 * it into a `slug -> status` map so `content/registry.ts` can let a status row
 * override a page's frontmatter `visibility` seed — without a landing
 * redeploy.
 *
 * Caching, TTL, cold-start retries and last-known-good fallback are the exact
 * mechanics `available-forms.ts` already uses for the forms list, reused here
 * via `cached-resolver.ts` rather than duplicated. A failed/cold fetch with no
 * cache falls back to an empty map, which is a no-op override — every page
 * keeps behaving exactly as its frontmatter says (ADR 0030 degradation model:
 * fail open to the seed, never fail closed).
 */

/** How long a fetched map is served before the next request refetches it. */
const TTL_MS = 60_000

/**
 * Extra fetch attempts on a cold start (no cached map yet) before giving up
 * and rendering from frontmatter alone.
 */
const COLD_START_RETRIES = 3

/** The three statuses a service_status row can hold (packages/database). */
export type ServiceStatusValue = 'enabled' | 'form_disabled' | 'disabled'
const STATUS_VALUES: ReadonlyArray<ServiceStatusValue> = [
  'enabled',
  'form_disabled',
  'disabled',
]

export type ServiceStatusMap = Record<string, ServiceStatusValue>

interface StatusCache {
  statuses: ServiceStatusMap
  fetchedAt: number
}

/** A mutable holder so the cache can be injected into the resolver for tests. */
export interface ServiceStatusCacheRef {
  current: StatusCache | null
}

/**
 * Validate a `GET /service_status` payload and extract its slug→status map.
 * Throws on an unexpected envelope, a non-string slug, or a status outside
 * the known enum, so a malformed response is treated as a fetch failure (and
 * falls back) rather than silently yielding a bad override. Pure — decoupled
 * from the network for testing.
 */
export function parseServiceStatuses(payload: unknown): ServiceStatusMap {
  const shape = payload as { status?: unknown; data?: unknown } | null
  if (
    typeof shape !== 'object' ||
    shape === null ||
    shape.status !== 'success' ||
    !Array.isArray(shape.data)
  ) {
    throw new Error(
      'unexpected response shape — expected {status:"success", data:[...]}',
    )
  }

  const result: ServiceStatusMap = {}
  for (const entry of shape.data) {
    const slug = (entry as { slug?: unknown } | null)?.slug
    if (typeof slug !== 'string') {
      throw new Error(
        `service status entry has a non-string slug: ${JSON.stringify(slug)}`,
      )
    }
    const status = (entry as { status?: unknown } | null)?.status
    if (
      typeof status !== 'string' ||
      !STATUS_VALUES.includes(status as ServiceStatusValue)
    ) {
      throw new Error(
        `service status entry has an invalid status: ${JSON.stringify(status)}`,
      )
    }
    result[slug] = status as ServiceStatusValue
  }
  return result
}

/** Fetch and validate the current service_status map. */
async function fetchServiceStatuses(): Promise<ServiceStatusMap> {
  const response = await fetchWithTimeout(
    `${formsApiBase()}/service_status`,
    FETCH_TIMEOUT_MS,
  )
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return parseServiceStatuses(await response.json())
}

/**
 * Resolve the service_status map through the cache. Pure with respect to time
 * and I/O — `now`, the `fetcher`, and the `cache` holder are injected so the
 * caching, freshness, and fallback behaviour can be tested without the
 * network or the server runtime. See `cached-resolver.ts` for the mechanics.
 */
export async function resolveServiceStatuses({
  now,
  ttlMs,
  fetcher,
  cache,
  coldStartRetries = 0,
  sleep,
}: {
  now: number
  ttlMs: number
  fetcher: () => Promise<ServiceStatusMap>
  cache: ServiceStatusCacheRef
  /** Extra attempts when there is no cached map to fall back on. */
  coldStartRetries?: number
  /** Injectable delay so tests don't wait on real timers. */
  sleep?: (ms: number) => Promise<void>
}): Promise<ServiceStatusMap> {
  return resolveCachedValue<ServiceStatusMap>({
    now,
    ttlMs,
    fetcher,
    coldStartRetries,
    sleep,
    emptyValue: {},
    getCached: () =>
      cache.current
        ? { value: cache.current.statuses, fetchedAt: cache.current.fetchedAt }
        : null,
    setCached: (entry) => {
      cache.current = { statuses: entry.value, fetchedAt: entry.fetchedAt }
    },
    onFetchFailure: (err) => {
      console.warn(
        '[service-status] could not fetch service statuses and have no ' +
          'cached copy — pages fall back to their frontmatter visibility ' +
          `until the next successful fetch. Cause: ${err instanceof Error ? err.message : String(err)}`,
      )
    },
  })
}

/** Per-instance cache, shared across requests served by this server process. */
const moduleCache: ServiceStatusCacheRef = { current: null }

/** Resolve the map through the per-instance cache, with cold-start retries. */
function resolveFromModuleCache(): Promise<ServiceStatusMap> {
  return resolveServiceStatuses({
    now: Date.now(),
    ttlMs: TTL_MS,
    fetcher: fetchServiceStatuses,
    cache: moduleCache,
    coldStartRetries: COLD_START_RETRIES,
  })
}

/**
 * Server function returning the service_status overrides, backed by the
 * per-instance cache. Returns a plain object so it serialises across the SSR
 * boundary.
 */
export const getServiceStatuses = createServerFn().handler(
  async (): Promise<ServiceStatusMap> => resolveFromModuleCache(),
)

// Warm the cache as soon as this module loads on the server, so the first
// request finds it already populated instead of paying the fetch. The
// `import.meta.env.SSR` guard strips this from the client bundle; the
// NODE_ENV check keeps it from firing real network calls under test.
if (import.meta.env.SSR && process.env.NODE_ENV !== 'test') {
  void resolveFromModuleCache()
}
