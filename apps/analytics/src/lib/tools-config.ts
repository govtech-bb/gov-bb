import type { ToolId } from '@govtech-bb/umami-analytics'

/**
 * The interactive tools (calculators + finders) surfaced on the analytics
 * "Tools" tab (#2119, #3517). Kept as a single config constant so the tab is
 * extended by adding a row here, not by editing the component/shaper.
 *
 * Each tool spans one or more landing routes:
 * - `id` — the `tool` value the tool sends in its `tool-*` events (ADR 0138),
 *   which the row's event metrics are filtered by.
 * - `prefix` — every landing URL under this prefix rolls up into the tool
 *   (e.g. the shelter finder's `/find` and `/guidance` sub-pages).
 * - `primaryPath` — the tool's canonical entry page; its referrers become the
 *   row's "Top source", and it's the path the row links to.
 * - `noResultOutcome` — the `tool-result` outcome that means the visitor got
 *   nothing (no matches, not eligible). Tools without one show no rate.
 * - `live` — an explicit flag for showing the tool on the tab (all eight are
 *   shown; NIS and pension are still `preview` on landing). Not derived from
 *   `visibility`: the calculators have no `-meta.ts`, so there's no single
 *   visibility source across the set. Deriving it is a follow-up once every
 *   tool carries metadata.
 */
export interface Tool {
  id: ToolId
  name: string
  prefix: string
  primaryPath: string
  noResultOutcome?: string
  live: boolean
}

export const TOOLS: Tool[] = [
  {
    id: 'severance-calculator',
    name: 'Find out how much severance you are owed',
    prefix: '/money-financial-support/calculate-severance-pay',
    primaryPath: '/money-financial-support/calculate-severance-pay',
    noResultOutcome: 'not-eligible',
    live: true,
  },
  {
    id: 'crop-over-permits',
    name: 'Find the permits you need for a Crop Over event',
    prefix: '/business-trade/crop-over-permits',
    primaryPath: '/business-trade/crop-over-permits',
    live: true,
  },
  {
    id: 'shelter-finder',
    name: 'Find an emergency shelter',
    prefix: '/health-and-emergency-services/find-an-emergency-shelter',
    primaryPath: '/health-and-emergency-services/find-an-emergency-shelter',
    noResultOutcome: 'no-results',
    live: true,
  },
  {
    id: 'bank-holidays',
    name: 'Check bank holiday dates',
    prefix: '/bank-holiday-calendar',
    primaryPath: '/bank-holiday-calendar',
    live: true,
  },
  // No route at the prefix itself: its start page is the markdown content
  // page, and `/find` plus each pharmacy's `/$slug` page sit under it.
  {
    id: 'pharmacy-finder',
    name: 'Find an open pharmacy',
    prefix: '/health-and-emergency-services/find-an-open-pharmacy',
    primaryPath: '/health-and-emergency-services/find-an-open-pharmacy',
    noResultOutcome: 'no-results',
    live: true,
  },
  {
    id: 'water-outages',
    name: 'Check for water outages in your area',
    prefix: '/health-and-emergency-services/water-outages',
    primaryPath: '/health-and-emergency-services/water-outages',
    live: true,
  },
  {
    id: 'nis-self-employed',
    name: 'Learn how to pay National Insurance when you work for yourself',
    prefix:
      '/money-financial-support/national-insurance-for-self-employed-workers',
    primaryPath:
      '/money-financial-support/national-insurance-for-self-employed-workers',
    live: true,
  },
  {
    id: 'pension-calculator',
    name: 'Calculate your Government pension',
    prefix: '/pensions-and-gratuities/calculate-your-pension',
    primaryPath: '/pensions-and-gratuities/calculate-your-pension',
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
