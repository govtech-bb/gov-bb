import { createServerFn } from '@tanstack/react-start'

/**
 * Runtime resolution of the available forms list.
 *
 * The landing app renders a "Start now" button for a page only when the
 * page's `form_id` is in the forms team's canonical list
 * (`${VITE_FORMS_API_URL}/form-definitions`). That list used to be baked into
 * the build by a pre-build script; it went stale whenever a form was published
 * or renamed until the next redeploy. Instead we fetch it live on the server,
 * cache it for `TTL_MS`, and keep the last good copy as a fallback.
 *
 * The fetch happens server-side (this is a `createServerFn`), so the browser
 * never calls the forms API and the visitor receives a fully-rendered page
 * with the buttons already decided — no client loading state.
 *
 * Freshness is a lazy refresh, not a push: a request arriving more than
 * `TTL_MS` after the last fetch triggers a refetch. Already-open pages do not
 * self-update. The cache is per server instance.
 *
 * To shrink the one window where buttons could be missing — a brand-new
 * instance whose first-ever request hits a down API — the cache is warmed when
 * this module loads on the server, and the cold-start fetch retries a few times
 * before giving up. Both only matter when there is no cached list yet; a warm
 * instance always falls back to its last-known-good list instantly.
 *
 * See docs/decisions/0030-landing-resolves-form-availability-at-runtime.md
 * (supersedes 0005).
 */

const DEFAULT_API_URL = 'https://forms.api.sandbox.alpha.gov.bb'
const FETCH_TIMEOUT_MS = 15_000

/** How long a fetched list is served before the next request refetches it. */
export const TTL_MS = 60_000

/**
 * Extra fetch attempts on a cold start (no cached list yet) before giving up
 * and rendering without Start buttons. Retries apply ONLY to the cold-start
 * path — a warm instance with a cached list falls back to it immediately rather
 * than make a visitor wait during an outage.
 */
const COLD_START_RETRIES = 3

/** Backoff between cold-start retries; the last value repeats if exceeded. */
const RETRY_DELAYS_MS = [200, 500, 1000]

function retryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** Canonical form IDs are kebab-case (ADR-0028). */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export interface FormsCache {
  ids: string[]
  fetchedAt: number
}

/** A mutable holder so the cache can be injected into the resolver for tests. */
export interface CacheRef {
  current: FormsCache | null
}

/**
 * Validate a `/form-definitions` payload and extract its form IDs. Throws on an
 * unexpected shape or an ID that fails kebab-case validation, so a malformed
 * response is treated as a fetch failure (and falls back) rather than silently
 * yielding garbage IDs. Pure — decoupled from the network for testing.
 */
export function parseFormIds(payload: unknown): string[] {
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

  const ids = (shape.data as Array<{ formId?: unknown }>)
    .map((entry) => entry?.formId)
    .filter(Boolean)

  for (const id of ids) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      throw new Error(`form ID failed validation: ${JSON.stringify(id)}`)
    }
  }
  return ids as string[]
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

/** Fetch and validate the canonical list of available form IDs. */
export async function fetchFormIds(): Promise<string[]> {
  const apiBase = (process.env.VITE_FORMS_API_URL ?? DEFAULT_API_URL).replace(
    /\/+$/,
    '',
  )
  const endpoint = `${apiBase}/form-definitions`

  const response = await fetchWithTimeout(endpoint, FETCH_TIMEOUT_MS)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return parseFormIds(await response.json())
}

/**
 * Resolve the available form IDs through the cache. Pure with respect to time
 * and I/O — `now`, the `fetcher`, and the `cache` holder are injected so the
 * caching, freshness, and fallback behaviour can be tested without the network
 * or the server runtime.
 *
 * - Fresh (younger than `ttlMs`): return the cached list, no fetch.
 * - Stale: refetch, update the cache, return the new list.
 * - Fetch fails with a cached list present: return the last-known-good list.
 * - Fetch fails with no cache (cold start): warn and return `[]` — the page
 *   renders without Start buttons and self-heals on the next successful fetch.
 */
export async function resolveAvailableForms({
  now,
  ttlMs,
  fetcher,
  cache,
  coldStartRetries = 0,
  sleep = defaultSleep,
}: {
  now: number
  ttlMs: number
  fetcher: () => Promise<string[]>
  cache: CacheRef
  /** Extra attempts when there is no cached list to fall back on. */
  coldStartRetries?: number
  /** Injectable delay so tests don't wait on real timers. */
  sleep?: (ms: number) => Promise<void>
}): Promise<string[]> {
  const cached = cache.current
  if (cached && now - cached.fetchedAt < ttlMs) {
    return cached.ids
  }

  // One attempt for a warm (stale) instance; on a cold start, retry a few times
  // before giving up so a momentary blip on the first-ever request doesn't blank
  // the buttons.
  const maxAttempts = cached ? 1 : 1 + Math.max(0, coldStartRetries)
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const ids = await fetcher()
      cache.current = { ids, fetchedAt: now }
      return ids
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) await sleep(retryDelayMs(attempt))
    }
  }

  if (cached) {
    // Stale but present: keep serving the last-known-good list.
    return cached.ids
  }

  console.warn(
    '[available-forms] could not fetch the forms list and have no cached ' +
      'copy — Start now buttons are suppressed until the next successful ' +
      `fetch. Cause: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  )
  return []
}

/** Per-instance cache, shared across requests served by this server process. */
const moduleCache: CacheRef = { current: null }

/** Resolve the list through the per-instance cache, with cold-start retries. */
function resolveFromModuleCache(): Promise<string[]> {
  return resolveAvailableForms({
    now: Date.now(),
    ttlMs: TTL_MS,
    fetcher: fetchFormIds,
    cache: moduleCache,
    coldStartRetries: COLD_START_RETRIES,
  })
}

/**
 * Server function returning the available form IDs, backed by the per-instance
 * cache. Returns a plain array so it serialises across the SSR boundary; the
 * consumer builds a `Set` for lookups.
 */
export const getAvailableForms = createServerFn().handler(
  async (): Promise<string[]> => resolveFromModuleCache(),
)

// Warm the cache as soon as this module loads on the server, so the first
// request finds it already populated instead of paying the fetch. The
// `import.meta.env.SSR` guard strips this from the client bundle; the
// NODE_ENV check keeps it from firing real network calls under test.
if (import.meta.env.SSR && process.env.NODE_ENV !== 'test') {
  void resolveFromModuleCache()
}
