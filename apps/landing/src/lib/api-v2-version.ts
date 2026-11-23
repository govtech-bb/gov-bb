import { z } from 'zod'
import { apiV2Breaker, readApiV2 } from './api-v2-reader'

/**
 * Watches api_v2's `GET /site-version`, a token that moves on every content
 * change, so a publish shows on the site within seconds rather than after a
 * cached page's max-age. Checked at most once per `EVERY_MS` per server
 * instance, before a read; when the token moves, `onChange` runs (landing's
 * page cache and its category-tree cache expire everything). A failed or slow check changes nothing, so
 * an api_v2 outage still serves the cached pages.
 */

export const EVERY_MS = 5_000
/** Shorter than a page read's timeout: this check delays a visitor's read. */
const TIMEOUT_MS = 300

/** Copied from apps/api_v2/src/routes/contracts.ts (`getSiteVersion`). */
const SiteVersion = z.object({ version: z.string() })

/**
 * The site version, or null when api_v2 didn't give one. Turned away while the
 * breaker is open, but its own failures neither count toward it nor log: the
 * short timeout would open it while page reads still succeed (#3644).
 */
export async function fetchSiteVersion(
  base: string | null,
  fetchImpl: typeof fetch = fetch,
  landingToken?: string,
): Promise<string | null> {
  if (!base || apiV2Breaker.isOpen(Date.now())) return null
  const result = await readApiV2(
    base,
    '/site-version',
    SiteVersion,
    fetchImpl,
    {
      landingToken,
      timeoutMs: TIMEOUT_MS,
      quiet: true,
    },
  )
  return result.kind === 'ok' ? result.value.version : null
}

export function createVersionWatch(
  read: () => Promise<string | null>,
  onChange: () => void,
) {
  let seen: string | null = null
  let checkedAt = -Infinity
  let pending: Promise<void> | null = null

  /** Resolves once the version is checked, or at once if it was checked within `EVERY_MS`. */
  return function check(now = Date.now()): Promise<void> {
    if (pending) return pending
    if (now - checkedAt < EVERY_MS) return Promise.resolve()
    checkedAt = now
    pending = read()
      .then((version) => {
        if (version === null) return
        // Also on the first read: a publish made while earlier reads failed
        // must still expire what was cached meanwhile. An empty cache costs nothing.
        if (version !== seen) onChange()
        seen = version
      })
      .finally(() => {
        pending = null
      })
    return pending
  }
}
