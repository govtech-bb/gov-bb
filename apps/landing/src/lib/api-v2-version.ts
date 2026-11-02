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

/** The site version, or null when api_v2 didn't give one. */
export async function fetchSiteVersion(
  base: string | null,
  fetchImpl: typeof fetch = fetch,
  landingToken?: string,
): Promise<string | null> {
  if (!base) return null
  try {
    const response = await fetchImpl(`${base}/site-version`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(landingToken && { headers: { 'x-landing-token': landingToken } }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      return null
    }
    const body = (await response.json()) as { version?: unknown }
    return typeof body.version === 'string' ? body.version : null
  } catch {
    return null
  }
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
