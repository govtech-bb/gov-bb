import { maskSearchQuery, trackEvent } from './analytics'

// The queries this tab already sent `search` for, as masked values (#3834).
const SENT_KEY = 'search-events-sent'

function readSent(): string[] {
  try {
    const sent: unknown = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? '[]')
    return Array.isArray(sent) ? sent : []
  } catch {
    return []
  }
}

/**
 * Send `search`, and `search-no-results` when there are no results, once per
 * query per browser session (#3834). The results page sends them on each
 * mount, so Back or a reload would let one person pass ADR 0111's
 * MIN_QUERY_COUNT alone. The query is keyed as Umami stores it, masked, so a
 * repeat matches the row the shapers count, and no unmasked ID number is kept
 * in storage. If storage throws, the events are sent on each mount.
 */
export function trackSearchOnce(query: string, results: number): void {
  const key = maskSearchQuery(query)
  const sent = readSent()
  if (sent.includes(key)) return
  trackEvent('search', { query, results })
  if (results === 0) trackEvent('search-no-results', { query })
  try {
    sessionStorage.setItem(SENT_KEY, JSON.stringify([...sent, key]))
  } catch {
    // Storage is blocked or full: the events were sent, so carry on.
  }
}
