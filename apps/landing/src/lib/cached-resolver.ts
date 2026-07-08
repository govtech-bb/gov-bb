/**
 * Generic per-instance cache + TTL + cold-start-retry + last-known-good
 * fallback mechanics, extracted from `available-forms.ts` (the original,
 * forms-list-specific version of this) so `service-status.ts` can reuse the
 * same caching behaviour for a differently-shaped value (a status map rather
 * than an ID list) instead of duplicating it (#1897).
 *
 * The caller owns fetching/validating its own value and reading/writing its
 * own cache slot (via `getCached`/`setCached`); this module owns only the
 * freshness/retry/fallback decision, generic over the cached value's type.
 */

const RETRY_DELAYS_MS = [200, 500, 1000]

function retryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export interface CachedEntry<T> {
  value: T
  fetchedAt: number
}

/**
 * Resolve a cached value through the same freshness/fallback rules as the
 * original `resolveAvailableForms`:
 *
 * - Fresh (younger than `ttlMs`): return the cached value, no fetch.
 * - Stale: refetch, update the cache, return the new value.
 * - Fetch fails with a cached value present: return the last-known-good value
 *   (re-stamped with `now` so a down API isn't retried on every request).
 * - Fetch fails with no cache (cold start): call `onFetchFailure` (if given)
 *   and return `emptyValue`.
 */
export async function resolveCachedValue<T>({
  now,
  ttlMs,
  fetcher,
  getCached,
  setCached,
  emptyValue,
  coldStartRetries = 0,
  sleep = defaultSleep,
  onFetchFailure,
}: {
  now: number
  ttlMs: number
  fetcher: () => Promise<T>
  getCached: () => CachedEntry<T> | null
  setCached: (entry: CachedEntry<T>) => void
  /** Returned when there is no fetch success and no prior cache to fall back on. */
  emptyValue: T
  /** Extra attempts when there is no cached value to fall back on. */
  coldStartRetries?: number
  /** Injectable delay so tests don't wait on real timers. */
  sleep?: (ms: number) => Promise<void>
  /** Called once, cold-start only, when every retry has failed and there is no cache. */
  onFetchFailure?: (err: unknown) => void
}): Promise<T> {
  const cached = getCached()
  if (cached && now - cached.fetchedAt < ttlMs) {
    return cached.value
  }

  // One attempt for a warm (stale) instance; on a cold start, retry a few times
  // before giving up so a momentary blip on the first-ever request doesn't blank
  // the page.
  const maxAttempts = cached ? 1 : 1 + Math.max(0, coldStartRetries)
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fetcher()
      setCached({ value, fetchedAt: now })
      return value
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) await sleep(retryDelayMs(attempt))
    }
  }

  if (cached) {
    setCached({ value: cached.value, fetchedAt: now })
    return cached.value
  }

  onFetchFailure?.(lastErr)
  return emptyValue
}
