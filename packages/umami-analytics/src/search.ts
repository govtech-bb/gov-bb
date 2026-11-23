// Search tab shaping. Used by the analytics dashboard, and kept here so the
// Slack /stats command can report the same search numbers. Pure: the caller
// reads the event values from Umami.
import type { EventDataValue } from "./types";

/** One row of the top-queries table. */
export interface SearchQueryStats {
  query: string;
  /** `search` events (results rendered) for this query in the window. */
  searches: number;
  /** `search-result-click` events for this query. */
  clicks: number;
  /** clicks ÷ searches, 0–1; 0 when no searches. */
  ctr: number;
  /** observed to return zero results (`search-no-results` event). */
  zeroResult: boolean;
}

/** The search figures for a window. */
export interface SearchStats {
  /** total `search` events (results rendered) in the window. */
  searches: number;
  /** total `search-result-click` events in the window. */
  clicks: number;
  /** clicks ÷ searches, 0–1; the overall click-through rate. */
  ctr: number;
  /** share of searches returning zero results, 0–1. */
  zeroResultRate: number;
  /** top queries by search count. */
  queries: SearchQueryStats[];
}

/**
 * Join the four search event-value distributions into the search view. Counts
 * come from summing each distribution's `total` (the `value` is the query text
 * or the result count, not a weight). The overall zero-result rate is taken from
 * the historical `search` `results` distribution (value 0), while the per-query
 * zero-result flag comes from the `search-no-results` event — the only
 * query-keyed signal, since Umami can't cross-tabulate query × results.
 */
export function shapeSearch(
  queryRows: EventDataValue[],
  resultsRows: EventDataValue[],
  clickRows: EventDataValue[],
  noResultRows: EventDataValue[],
  topN = 20,
): SearchStats {
  const clicksByQuery = new Map<string, number>();
  for (const r of clickRows) {
    const q = String(r.value);
    clicksByQuery.set(q, (clicksByQuery.get(q) ?? 0) + r.total);
  }
  const zeroResultQueries = new Set(noResultRows.map((r) => String(r.value)));

  const clicks = clickRows.reduce((s, r) => s + r.total, 0);
  const resultsEvents = resultsRows.reduce((s, r) => s + r.total, 0);
  const queryEvents = queryRows.reduce((s, r) => s + r.total, 0);
  const zeroResults = resultsRows
    .filter((r) => Number(r.value) === 0)
    .reduce((s, r) => s + r.total, 0);

  // Total searches from whichever distribution is more complete. The `results`
  // property has tiny cardinality (a few counts) so it can't be row-capped,
  // while the high-cardinality `query` distribution can be — taking the max
  // stops a truncated or failed call from deflating the total and inflating CTR.
  const searches = Math.max(queryEvents, resultsEvents);

  const queries: SearchQueryStats[] = queryRows
    .map((r) => {
      const query = String(r.value);
      const clicksForQuery = clicksByQuery.get(query) ?? 0;
      return {
        query,
        searches: r.total,
        clicks: clicksForQuery,
        ctr: r.total ? clicksForQuery / r.total : 0,
        zeroResult: zeroResultQueries.has(query),
      };
    })
    .sort((a, b) => b.searches - a.searches)
    .slice(0, topN);

  return {
    searches,
    clicks,
    ctr: searches ? clicks / searches : 0,
    zeroResultRate: resultsEvents ? zeroResults / resultsEvents : 0,
    queries,
  };
}
