/**
 * The interactive tools (calculators + finders) surfaced on the analytics
 * "Tools" tab (#2119). Kept as a single config constant so the tab is extended
 * by adding a row here, not by editing the component/shaper.
 *
 * Each tool spans one or more landing routes:
 * - `prefix` — every landing URL under this prefix rolls up into the tool
 *   (e.g. the shelter finder's `/find` and `/guidance` sub-pages).
 * - `primaryPath` — the tool's canonical entry page; its referrers become the
 *   row's "Top source", and it's the path the row links to.
 * - `live` — an explicit flag (all four are live today). Not derived from
 *   `visibility`: the two calculators have no `-meta.ts`, so there's no single
 *   visibility source across the set. Deriving it is a follow-up once every
 *   tool carries metadata.
 */
export interface Tool {
  name: string
  prefix: string
  primaryPath: string
  live: boolean
}

export const TOOLS: Tool[] = [
  {
    name: 'Find out how much severance you are owed',
    prefix: '/money-financial-support/calculate-severance-pay',
    primaryPath: '/money-financial-support/calculate-severance-pay',
    live: true,
  },
  {
    name: 'Find the permits you need for a Crop Over event',
    prefix: '/business-trade/crop-over-permits',
    primaryPath: '/business-trade/crop-over-permits',
    live: true,
  },
  {
    name: 'Find an emergency shelter',
    prefix: '/health-and-emergency-services/find-an-emergency-shelter',
    primaryPath: '/health-and-emergency-services/find-an-emergency-shelter',
    live: true,
  },
  {
    name: 'Check bank holiday dates',
    prefix: '/bank-holiday-calendar',
    primaryPath: '/bank-holiday-calendar',
    live: true,
  },
]

/** The live tools, in declared order — the set the Tools tab renders. */
export const liveTools = (): Tool[] => TOOLS.filter((t) => t.live)

/**
 * Does a landing URL path belong to a tool's route prefix? Exact match or a
 * `/`-boundary descendant — so `/bank-holiday-calendar` never swallows a
 * same-stemmed sibling like `/bank-holiday-calendar-archive`.
 */
export function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}
