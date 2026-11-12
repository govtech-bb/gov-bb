import type { ApiV2Result } from './api-v2-page'
import { failed } from './api-v2-reader'
import type { createApiV2Breaker } from './api-v2-reader'

/**
 * In-memory cache in front of api_v2 page reads (#3127), per server instance.
 * TTLs come only from api_v2's `Cache-Control` (#2702): pages get max-age 60 +
 * stale-while-revalidate 300, a 404 max-age 10, `no-store` nothing. A stale
 * entry is served at once while one background refetch per URL runs; on a
 * failure the last good copy is served at any age, marked `stale`. While the
 * breaker (api-v2-reader.ts) is open api_v2 isn't called. `expire()` makes
 * every entry stale at once, for when api_v2's site version moves (a publish):
 * the next read of each url waits for a fresh copy, falling back to the old
 * one on a failure.
 *
 * Keyed by URL alone, which is safe only because every read through it is a
 * public one: a reviewer's read sends `x-preview-token` and skips this cache
 * for reads and writes alike (`loadApiV2Page` in api-v2-page.ts, #2961), not
 * relying on api_v2's `no-store` to keep it from being written.
 */

export const MAX_ENTRIES = 500
/** A kept page served because api_v2 failed: `x-content-source: api_v2-stale`. */
const kept = (r: ApiV2Result): ApiV2Result =>
  r.kind === 'page' ? { ...r, stale: true } : r

function seconds(cacheControl: string | null | undefined, directive: RegExp) {
  return Number(cacheControl?.match(directive)?.[1] ?? 0) * 1000
}

interface Entry {
  result: ApiV2Result
  storedAt: number
  maxAgeMs: number
  swrMs: number
}

/** `breaker`: the one every api_v2 read shares; a fresh one only in tests. */
export function createApiV2Cache(
  breaker: ReturnType<typeof createApiV2Breaker>,
) {
  const entries = new Map<string, Entry>()
  const inflight = new Map<string, Promise<ApiV2Result>>()
  /** Bumped by `expire()`, so a fetch begun before it can't store its older answer as fresh. */
  let generation = 0

  function revalidate(
    url: string,
    resolve: () => Promise<ApiV2Result>,
    now: number,
  ) {
    let pending = inflight.get(url)
    if (pending) return pending
    const startedIn = generation
    pending = resolve()
      .then((result) => {
        breaker.record(failed(result), url, now)
        if (failed(result) || startedIn !== generation) return result
        const maxAgeMs = seconds(result.cacheControl, /max-age=(\d+)/)
        const swrMs = seconds(
          result.cacheControl,
          /stale-while-revalidate=(\d+)/,
        )
        entries.delete(url)
        if (maxAgeMs + swrMs > 0) {
          entries.set(url, { result, storedAt: now, maxAgeMs, swrMs })
          // Oldest non-page first, so junk-url 404s can't push out the pages
          // served during an outage. ponytail: FIFO within each kind; LRU if
          // real pages are ever seen evicted.
          if (entries.size > MAX_ENTRIES) {
            let victim = entries.keys().next().value!
            for (const [key, e] of entries)
              if (e.result.kind !== 'page') {
                victim = key
                break
              }
            entries.delete(victim)
          }
        }
        return result
      })
      .finally(() => {
        if (inflight.get(url) === pending) inflight.delete(url)
      })
    inflight.set(url, pending)
    return pending
  }

  async function get(
    url: string,
    resolve: () => Promise<ApiV2Result>,
    now = Date.now(),
  ): Promise<ApiV2Result> {
    const entry = entries.get(url)
    const age = entry ? now - entry.storedAt : Infinity
    if (entry && age < entry.maxAgeMs) return entry.result
    if (breaker.isOpen(now))
      return entry
        ? kept(entry.result)
        : { kind: 'miss', reason: 'circuit_open' }
    if (entry && age < entry.maxAgeMs + entry.swrMs) {
      void revalidate(url, resolve, now).catch(() => {})
      return entry.result
    }
    const result = await revalidate(url, resolve, now)
    return failed(result) && entry ? kept(entry.result) : result
  }

  function expire() {
    generation++
    inflight.clear()
    for (const entry of entries.values()) entry.storedAt = -Infinity
  }

  return { get, expire }
}
