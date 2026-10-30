import type { ApiV2Result } from './api-v2-page'
import { REASONS } from './api-v2-log'

/**
 * In-memory cache in front of api_v2 page reads (#3127), per server instance.
 * TTLs come only from api_v2's `Cache-Control` (#2702): pages get max-age 60 +
 * stale-while-revalidate 300, a 404 max-age 10, `no-store` nothing. A stale
 * entry is served at once while one background refetch per URL runs; on a
 * failure the last good copy is served at any age, marked `stale`. After three
 * failures in a row api_v2 isn't called for 30 s.
 *
 * Keyed by URL alone, which is safe only because landing never sends
 * `x-preview-token`, so api_v2's answer is the same for every viewer. A call
 * that forwards the token must skip this cache for reads too, not just rely
 * on api_v2's `no-store` keeping it from being written.
 */

export const MAX_ENTRIES = 500
const FAILURES_TO_OPEN = 3
const OPEN_MS = 30_000
/** api_v2 failed (vs. answered): never cached, counted toward the breaker. */
const failed = (r: ApiV2Result) =>
  r.kind === 'miss' && REASONS[r.reason].failure

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

export function createApiV2Cache() {
  const entries = new Map<string, Entry>()
  const inflight = new Map<string, Promise<ApiV2Result>>()
  let failures = 0
  let openUntil = 0

  function revalidate(
    url: string,
    resolve: () => Promise<ApiV2Result>,
    now: number,
  ) {
    let pending = inflight.get(url)
    if (pending) return pending
    pending = resolve()
      .then((result) => {
        if (failed(result)) {
          // Started before the breaker opened: already counted by its trip.
          if (now < openUntil) return result
          if (++failures >= FAILURES_TO_OPEN) {
            openUntil = now + OPEN_MS
            failures = 0
            console.error(JSON.stringify({ event: 'api_v2_circuit_open', url }))
          }
          return result
        }
        failures = 0
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
      .finally(() => inflight.delete(url))
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
    if (now < openUntil)
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

  return { get }
}
