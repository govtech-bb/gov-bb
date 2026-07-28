import { createServerFn } from '@tanstack/react-start'
import { resolveCachedValue } from './cached-resolver'
import { formsApiBase } from './forms-api-url'
import type { ViewLevel } from './frontmatter'

/**
 * Runtime resolution of database-driven service visibility.
 *
 * The feature-flagging admin tool writes a per-service status to the API
 * (`PUT /service_status`); landing reads the current statuses at runtime
 * (`GET /service_status`) and gates content accordingly, so an admin toggle
 * takes effect without a landing redeploy. A status row *overrides* a service's
 * frontmatter default; a service with no row keeps its build-time behaviour.
 *
 * The endpoint lives on the same API host landing already reaches for the forms
 * list (`VITE_FORMS_API_URL` — it also serves `/form-definitions`, `/feedback`,
 * `/services`), so no new env var is needed, and the read is public (no token).
 *
 * Mirrors `available-forms.ts`: a server-side fetch (`createServerFn`), a
 * per-instance cache served for `TTL_MS`, last-known-good fallback on failure,
 * cold-start retries, and a module-load warm fetch. On a cold-start failure the
 * map is empty — every service falls back to its frontmatter default (the site
 * never goes down over a status outage).
 */

/** DB-backed status for one service (mirrors the API's `ServiceStatus` enum). */
export type ServiceStatus = 'enabled' | 'form_disabled' | 'disabled'

/**
 * One `[key, status]` pair — a plain tuple so it serialises across SSR. The
 * `key` is the platform's **canonical service key**: the `form_id` for a
 * form-backed service, else the content slug (see feature-flagging
 * `catalogue.ts` / the seed tool, #1898). The registry reconciles a content
 * page to its key via `form_id ?? slug`.
 */
export type ServiceStatusEntry = [key: string, status: ServiceStatus]

const FETCH_TIMEOUT_MS = 15_000

/**
 * How long a fetched map is served before the next request refetches it. 15s
 * in local dev (`vite dev`) so an admin service-status toggle shows on landing
 * quickly; 60s in the built sandbox/staging/production bundles.
 */
const TTL_MS = import.meta.env.DEV ? 15_000 : 60_000

/**
 * Extra fetch attempts on a cold start (no cached map yet) before giving up and
 * falling back to frontmatter defaults. A warm instance never retries — it falls
 * back to its last-known-good map immediately rather than make a visitor wait.
 */
const COLD_START_RETRIES = 3

const STATUS_VALUES: ReadonlySet<string> = new Set([
  'enabled',
  'form_disabled',
  'disabled',
])

interface StatusCache {
  entries: ServiceStatusEntry[]
  fetchedAt: number
}

/** A mutable holder so the cache can be injected into the resolver for tests. */
export interface CacheRef {
  current: StatusCache | null
}

/**
 * Validate a `/service_status` payload and extract its `[slug, status]` entries.
 * Throws on an unexpected shape, an unknown status value, or a non-string /
 * empty slug, so a malformed response is treated as a fetch failure (and falls
 * back) rather than silently yielding garbage. Pure — decoupled from the network
 * for testing.
 */
export function parseServiceStatuses(payload: unknown): ServiceStatusEntry[] {
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

  return shape.data.map((entry) => {
    const slug = entry?.slug
    const status = entry?.status
    if (
      typeof slug !== 'string' ||
      slug.length === 0 ||
      typeof status !== 'string' ||
      !STATUS_VALUES.has(status)
    ) {
      throw new Error(
        `service status failed validation: ${JSON.stringify(entry)}`,
      )
    }
    return [slug, status as ServiceStatus]
  })
}

/**
 * The visibility overlay for the registry gate functions: the effective
 * `ViewLevel` a status forces for a canonical service key, overriding
 * frontmatter. The registry resolves each content page to its key
 * (`form_id ?? slug`) before looking it up here.
 *
 * - `disabled` → `preview`: hidden from the public, but a preview-token holder
 *   still sees it (matches the API entity's "viewable only with the preview
 *   token/cookie").
 * - `enabled` → `public`: a row publishes the service even if its frontmatter
 *   default is `preview`/`draft` (the admin tool is the launch switch).
 * - `form_disabled` → omitted: the page stays visible; only the form is gated
 *   (handled separately via {@link deriveFormDisabledSlugs}).
 */
export function deriveVisibilityOverlay(
  entries: ServiceStatusEntry[],
): Map<string, ViewLevel> {
  const overlay = new Map<string, ViewLevel>()
  for (const [slug, status] of entries) {
    if (status === 'disabled') overlay.set(slug, 'preview')
    else if (status === 'enabled') overlay.set(slug, 'public')
  }
  return overlay
}

/**
 * The canonical keys whose form is disabled — their form is treated as under
 * maintenance. A `form_disabled` service always has a form, so these keys are
 * `form_id`s, matched directly against a page's `form_id`.
 */
export function deriveFormDisabledSlugs(
  entries: ServiceStatusEntry[],
): Set<string> {
  return new Set(
    entries
      .filter(([, status]) => status === 'form_disabled')
      .map(([key]) => key),
  )
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch and validate the current service statuses. */
async function fetchServiceStatuses(): Promise<ServiceStatusEntry[]> {
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
 * Resolve the service statuses through the cache. A thin adapter over the shared
 * {@link resolveCachedValue} — it maps this module's `{ entries, fetchedAt }`
 * cache slot onto the generic `{ value, fetchedAt }` shape. `now`, the `fetcher`,
 * and the `cache` holder are injected so the caching, freshness, and fallback
 * behaviour can be tested without the network. A cold-start failure with no
 * cache warns and returns `[]` — every service falls back to its frontmatter
 * default and self-heals on the next fetch.
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
  fetcher: () => Promise<ServiceStatusEntry[]>
  cache: CacheRef
  /** Extra attempts when there is no cached map to fall back on. */
  coldStartRetries?: number
  /** Injectable delay so tests don't wait on real timers. */
  sleep?: (ms: number) => Promise<void>
}): Promise<ServiceStatusEntry[]> {
  return resolveCachedValue<ServiceStatusEntry[]>({
    now,
    ttlMs,
    fetcher,
    getCached: () =>
      cache.current
        ? { value: cache.current.entries, fetchedAt: cache.current.fetchedAt }
        : null,
    setCached: (entry) => {
      cache.current = { entries: entry.value, fetchedAt: entry.fetchedAt }
    },
    emptyValue: [],
    coldStartRetries,
    sleep,
    onFetchFailure: (err) => {
      console.warn(
        '[service-status] could not fetch service statuses and have no cached ' +
          'copy — services fall back to their frontmatter defaults until the ' +
          `next successful fetch. Cause: ${err instanceof Error ? err.message : String(err)}`,
      )
    },
  })
}

/** Per-instance cache, shared across requests served by this server process. */
const moduleCache: CacheRef = { current: null }

/** Resolve the statuses through the per-instance cache, with cold-start retries. */
function resolveFromModuleCache(): Promise<ServiceStatusEntry[]> {
  return resolveServiceStatuses({
    now: Date.now(),
    ttlMs: TTL_MS,
    fetcher: fetchServiceStatuses,
    cache: moduleCache,
    coldStartRetries: COLD_START_RETRIES,
  })
}

/**
 * Server function returning the current service statuses as `[slug, status]`
 * entries, backed by the per-instance cache. Returns a plain array so it
 * serialises across the SSR boundary; the consumer builds the overlays.
 */
export const getServiceStatuses = createServerFn().handler(
  async (): Promise<ServiceStatusEntry[]> => resolveFromModuleCache(),
)

// Warm the cache as soon as this module loads on the server, so the first
// request finds it already populated. The `import.meta.env.SSR` guard strips
// this from the client bundle; the NODE_ENV check keeps it from firing real
// network calls under test.
if (import.meta.env.SSR && process.env.NODE_ENV !== 'test') {
  void resolveFromModuleCache()
}
