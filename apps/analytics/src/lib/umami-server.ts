// Server-only: reads Umami in real time for the /analytics dashboard. Called
// from the TanStack Start server functions in report.ts (which supply the
// resolved config), so the API key stays on the server and never reaches the
// browser. No DB, no snapshot — the site overview and each form's detail are
// fetched on demand and deduped by a short in-memory TTL (cache.ts). This
// module deliberately has no `nitro/runtime-config` import so its pure shapers
// stay unit-testable.
import { defaultValidationMessage } from '@govtech-bb/form-validation'
import {
  FUNNEL_WINDOW_MIN,
  UmamiClient,
  aggregateFormEvents,
  buildFunnelSteps,
  buildVisitFunnelSteps,
  funnelHeadline,
  buildSources,
  canonicalEvent,
  eventFormKey,
  eventName,
  startOfDayInTz,
  tallyFieldErrors,
  tzOffsetMs,
  weightedAverage,
  weightedSum,
  type EventDataValue,
  type ExpandedRow,
  type FunnelStage,
  type FunnelStepResult,
  type JourneyPath,
  type PageRow,
  type Range,
  type SourceRow,
  type ToolId,
} from '@govtech-bb/umami-analytics'
import { memoize } from './cache'
import { liveTools, pathMatchesPrefix, type Tool } from './tools-config'
import { isExcludedPath } from './page-exclusions'
import type { ServiceIndexEntry } from '@govtech-bb/content'

// The funnel definitions live in the shared package so the Slack /stats command
// (#3491) reports the same numbers; re-exported for existing callers.
export { buildFunnelSteps, buildVisitFunnelSteps, funnelHeadline }

const TTL_MS = 60_000
// Barbados has no DST (UTC−4), so calendar-day boundaries are stable.
const TZ = 'America/Barbados'

export interface UmamiConfig {
  apiKey: string
  landingWebsiteId: string
  formsWebsiteId: string
  formsApiUrl: string
}

export function isConfigured(cfg: UmamiConfig): boolean {
  return Boolean(cfg.apiKey && cfg.landingWebsiteId && cfg.formsWebsiteId)
}

/**
 * Landing-only configured gate. The Search tab's data comes solely from the
 * landing site (`fetchSearchData` reads `landingWebsiteId` only), so it must not
 * be gated on the forms website id like `isConfigured` — otherwise a deploy with
 * landing analytics but no forms site wrongly renders "Analytics is not
 * configured" despite the search data being available.
 */
export function isLandingConfigured(cfg: UmamiConfig): boolean {
  return Boolean(cfg.apiKey && cfg.landingWebsiteId)
}

// --- date-range presets (#homepage filter) ---------------------------------

export interface RangeOption {
  key: string
  label: string
}

/** Selectable windows shown in the homepage filter. */
export const RANGE_OPTIONS: RangeOption[] = [
  { key: 'today', label: 'Today' },
  { key: 'this-week', label: 'This week' },
  { key: 'this-month', label: 'This month' },
  { key: 'past-7-days', label: 'Past 7 days' },
  { key: 'past-15-days', label: 'Past 15 days' },
  { key: 'past-30-days', label: 'Past 30 days' },
  { key: 'past-60-days', label: 'Last 60 days' },
  { key: 'past-90-days', label: 'Last 90 days' },
]
export const DEFAULT_RANGE = 'past-30-days'

/** Normalise an untrusted range key to a known one. */
export function normaliseRange(key: string | undefined): string {
  return RANGE_OPTIONS.some((o) => o.key === key)
    ? (key as string)
    : DEFAULT_RANGE
}

export function rangeLabel(key: string): string {
  const k = normaliseRange(key)
  return RANGE_OPTIONS.find((o) => o.key === k)?.label ?? 'Past 30 days'
}

/** Resolve a range key to a concrete { startAt, endAt } window (tz-aware). */
export function rangeForKey(key: string, now: Date = new Date()): Range {
  const endAt = now.getTime()
  const k = normaliseRange(key)
  // tz "wall clock" now, for week/month boundaries.
  const wall = new Date(now.getTime() + tzOffsetMs(TZ, now))
  switch (k) {
    case 'today':
      return { startAt: startOfDayInTz(TZ, now, 0), endAt }
    case 'this-week': {
      // ISO week: Monday start. getUTCDay on the wall clock: 0=Sun..6=Sat.
      const daysFromMonday = (wall.getUTCDay() + 6) % 7
      return { startAt: startOfDayInTz(TZ, now, daysFromMonday), endAt }
    }
    case 'this-month':
      return { startAt: startOfDayInTz(TZ, now, wall.getUTCDate() - 1), endAt }
    case 'past-7-days':
      return { startAt: startOfDayInTz(TZ, now, 6), endAt }
    case 'past-15-days':
      return { startAt: startOfDayInTz(TZ, now, 14), endAt }
    case 'past-60-days':
      return { startAt: startOfDayInTz(TZ, now, 59), endAt }
    case 'past-90-days':
      return { startAt: startOfDayInTz(TZ, now, 89), endAt }
    default: // past-30-days
      return { startAt: startOfDayInTz(TZ, now, 29), endAt }
  }
}

// --- shared shapes ---------------------------------------------------------

export interface FormListItem {
  formId: string
  title: string
  /** distinct visitors who started the form (funnel report), in the window. */
  starts: number
  /** distinct visitors who reached submit (funnel report), in the window. */
  completions: number
  /** completions ÷ starts × 100, 1dp; 0 when no starts. */
  completionPct: number
}
export interface SiteStats {
  visitors: number
  pageviews: number
  /** visits (Umami sessions). */
  sessions: number
  /** bounces ÷ sessions, 0–1. */
  bounceRate: number
  /** pageviews ÷ sessions. */
  avgStepsPerVisit: number
  /** `search-submit` events (search-box submissions). */
  searches: number
}
export interface OverviewData {
  stats: SiteStats
  pages: PageRow[]
  forms: FormListItem[]
  /** layered visitor-flow (Sankey) of the first few steps into a visit. */
  flow: FlowData
  /** the same journeys as a ranked breadcrumb list (table view of the flow). */
  journeys: JourneyRow[]
  /** the resolved window as `yyyy-mm-dd` bounds (start === end ⇒ single day). */
  period: { start: string; end: string }
  generatedAt: string
  window: string
  range: string
}

/** Submit reliability (#1916). */
export interface SubmitError {
  total: number
  attempts: number
  rate: number | null
  byReason: { reason: string; count: number }[]
}

export interface FieldCount {
  field: string
  count: number
}

/** One reason a field failed, resolved for display. */
export interface FieldFailureReason {
  /** stable reason code (rule type or synthetic date code). */
  code: string
  /** the full error message a user would see, from the contract or defaults. */
  message: string
  count: number
}

/** A field's validation failures, with its human label and reason breakdown. */
export interface FieldFailure {
  fieldId: string
  /** human label from the form contract; falls back to the field id. */
  label: string
  count: number
  reasons: FieldFailureReason[]
}

export interface FormDetailData {
  formId: string
  title: string
  // Headline — distinct visitors (Umami funnel report).
  /** distinct visitors who viewed the form page. */
  visits: number
  starts: number
  completed: number
  completionPct: number
  /** starts ÷ visits × 100, 1dp; the share of visitors who started. */
  visitsToStartsPct: number
  avgDurationSeconds: number | null
  /** total field validation errors (event count). */
  totalFieldErrors: number
  /** Start → Step N (titled) → Submit, with view counts. Event counts. */
  funnel: FunnelStage[]
  /** which fields fail and why, most-problematic first (`[0]` is the worst). */
  fieldFailures: FieldFailure[]
  /** submit reliability (#1916). */
  submitError: SubmitError
  generatedAt: string
  window: string
  range: string
}

// --- search analytics ------------------------------------------------------

/** One row of the top-queries table. */
export interface SearchQueryRow {
  query: string
  /** `search` events (results rendered) for this query in the window. */
  searches: number
  /** `search-result-click` events for this query. */
  clicks: number
  /** clicks ÷ searches, 0–1; 0 when no searches. */
  ctr: number
  /** observed to return zero results (`search-no-results` event). */
  zeroResult: boolean
}

export interface SearchData {
  /** total `search` events (results rendered) in the window. */
  searches: number
  /** total `search-result-click` events in the window. */
  clicks: number
  /** clicks ÷ searches, 0–1; the overall click-through rate. */
  ctr: number
  /** share of searches returning zero results, 0–1. */
  zeroResultRate: number
  /** top queries by search count. */
  queries: SearchQueryRow[]
  generatedAt: string
  window: string
  range: string
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
): Omit<SearchData, 'generatedAt' | 'window' | 'range'> {
  const clicksByQuery = new Map<string, number>()
  for (const r of clickRows) {
    const q = String(r.value)
    clicksByQuery.set(q, (clicksByQuery.get(q) ?? 0) + r.total)
  }
  const zeroResultQueries = new Set(noResultRows.map((r) => String(r.value)))

  const clicks = clickRows.reduce((s, r) => s + r.total, 0)
  const resultsEvents = resultsRows.reduce((s, r) => s + r.total, 0)
  const queryEvents = queryRows.reduce((s, r) => s + r.total, 0)
  const zeroResults = resultsRows
    .filter((r) => Number(r.value) === 0)
    .reduce((s, r) => s + r.total, 0)

  // Total searches from whichever distribution is more complete. The `results`
  // property has tiny cardinality (a few counts) so it can't be row-capped,
  // while the high-cardinality `query` distribution can be — taking the max
  // stops a truncated or failed call from deflating the total and inflating CTR.
  const searches = Math.max(queryEvents, resultsEvents)

  const queries: SearchQueryRow[] = queryRows
    .map((r) => {
      const query = String(r.value)
      const clicksForQuery = clicksByQuery.get(query) ?? 0
      return {
        query,
        searches: r.total,
        clicks: clicksForQuery,
        ctr: r.total ? clicksForQuery / r.total : 0,
        zeroResult: zeroResultQueries.has(query),
      }
    })
    .sort((a, b) => b.searches - a.searches)
    .slice(0, topN)

  return {
    searches,
    clicks,
    ctr: searches ? clicks / searches : 0,
    zeroResultRate: resultsEvents ? zeroResults / resultsEvents : 0,
    queries,
  }
}

// --- pure shapers (unit-tested) --------------------------------------------

const STAGE_LABELS = ['Start', 'Review', 'Submit']

export function shapeFunnel(funnelRows: FunnelStepResult[]): FunnelStage[] {
  return funnelRows.map((row, i) => ({
    label: STAGE_LABELS[i] ?? row.value,
    count: row.visitors,
    dropoffPct: row.dropoff == null ? 0 : Math.round(row.dropoff * 1000) / 10,
  }))
}

/**
 * Post-submit / payment tail counts for the step funnel (#1955). All optional:
 * `reviewCount`/`confirmationCount` are appended when provided; the payment
 * stages render only when `paymentInitiatedCount > 0` (payment forms are
 * detected by event presence — the public forms API doesn't expose processors).
 */
export interface StepFunnelTail {
  reviewCount?: number
  confirmationCount?: number
  paymentInitiatedCount?: number
  paymentSuccessCount?: number
}

/**
 * Step funnel labelled by step identity, covering the full journey (#1955):
 * Start → each defined step ("Step N: <title>", declared order) → Review →
 * Submit → Confirmation → (payment forms) Payment initiated → Payment success.
 * Counts are event views (`form-start`, per-step `form-step-view`,
 * `form-review`, `form-submit`, `form-confirmation-view`, `payment-*`). Steps
 * are keyed by stepId (not the funnel's positional "Step N", which branching
 * makes visitor-relative), so a conditional step a visitor's answers skip shows
 * fewer or zero views. `dropoffPct` is 0 throughout — step-over-step drop-off
 * isn't meaningful across the branch points in the step portion, so the raw
 * counts (not a computed rate) carry the drop-off signal.
 */
export function buildStepFunnel(
  startCount: number,
  submitCount: number,
  orderedSteps: { stepId: string; title: string }[],
  reachedByStep: Record<string, number>,
  tail: StepFunnelTail = {},
): FunnelStage[] {
  const stages: FunnelStage[] = [
    { label: 'Start', count: startCount, dropoffPct: 0 },
    ...orderedSteps.map((s, i) => ({
      label: `Step ${i + 1}: ${s.title}`,
      count: reachedByStep[s.stepId] ?? 0,
      dropoffPct: 0,
    })),
  ]
  if (tail.reviewCount !== undefined) {
    stages.push({ label: 'Review', count: tail.reviewCount, dropoffPct: 0 })
  }
  stages.push({ label: 'Submit', count: submitCount, dropoffPct: 0 })
  if (tail.confirmationCount !== undefined) {
    stages.push({
      label: 'Confirmation',
      count: tail.confirmationCount,
      dropoffPct: 0,
    })
  }
  if ((tail.paymentInitiatedCount ?? 0) > 0) {
    stages.push({
      label: 'Payment initiated',
      count: tail.paymentInitiatedCount ?? 0,
      dropoffPct: 0,
    })
    stages.push({
      label: 'Payment success',
      count: tail.paymentSuccessCount ?? 0,
      dropoffPct: 0,
    })
  }
  return stages
}

// The current app emits `errors: network | payment-init | server`; older data
// put other strings (e.g. field validation messages) here, so anything off this
// list is bucketed as "other" (#1916 asks for network/payment/server/other).
const KNOWN_SUBMIT_ERROR_REASONS = new Set([
  'network',
  'payment-init',
  'server',
])

export function shapeSubmitError(
  submitTotal: number,
  errorTotal: number,
  reasonRows: EventDataValue[],
): SubmitError {
  const attempts = submitTotal + errorTotal
  const tally = new Map<string, number>()
  for (const r of reasonRows) {
    const raw = String(r.value)
    const reason = KNOWN_SUBMIT_ERROR_REASONS.has(raw) ? raw : 'other'
    tally.set(reason, (tally.get(reason) ?? 0) + r.total)
  }
  const byReason = [...tally.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
  return {
    total: errorTotal,
    attempts,
    rate: attempts ? errorTotal / attempts : null,
    byReason,
  }
}

/**
 * Build the forms-list rows from per-form distinct-visitor funnel headlines
 * (the same start→…→submit funnel the per-form page uses), so the list and the
 * detail page report identical starts/completions.
 */
export function shapeFormList(
  forms: { formId: string; title: string }[],
  headlineById: Map<string, { starts: number; completed: number }>,
): FormListItem[] {
  return forms.map((f) => {
    const { starts, completed } = headlineById.get(f.formId) ?? {
      starts: 0,
      completed: 0,
    }
    return {
      ...f,
      starts,
      completions: completed,
      completionPct: starts ? Math.round((completed / starts) * 1000) / 10 : 0,
    }
  })
}

// --- flow (Sankey) ---------------------------------------------------------

export interface FlowNode {
  id: string
  column: number
  label: string
  value: number
  /** share of total entry visits (0–1). */
  pct: number
}
export interface FlowLink {
  source: string
  target: string
  value: number
}
export interface FlowData {
  nodes: FlowNode[]
  links: FlowLink[]
  /** total visits entering the flow (sum of column-0 nodes). */
  total: number
}

const SEP = '\u241F' // node-id separator
const LSEP = '\u241E' // link-key separator
const OTHER = '__other__'

function humanizeSlug(s: string): string {
  const spaced = s.replace(/[-_]/g, ' ').trim()
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : s
}

/**
 * Turn a raw journey step (path or `<form>:<event>`) into a short label. The
 * generic "Start" (form-start event or a `/…/start` page) and "Form"
 * (`/…/form` page) steps are qualified with their root service — e.g.
 * "Get birth certificate · Start" — so they're not ambiguous in the flow. Pass
 * `qualifyGoal = false` (used by the journey breadcrumb list, where the
 * preceding step already gives the context) to get the bare "Start"/"Form".
 */
export function humanizeStep(raw: string, qualifyGoal = true): string {
  if (!raw) return ''
  if (!raw.startsWith('/') && raw.includes(':')) {
    const form = raw.slice(0, raw.indexOf(':'))
    // Canonicalise so a long-id form's compact code (#2682, e.g. `fstrt`/`sview`)
    // resolves to its real event rather than rendering as "Fstrt".
    const event = canonicalEvent(raw.slice(raw.indexOf(':') + 1))
    if (event === 'form-start')
      return qualifyGoal ? `${humanizeSlug(form)} · Start` : 'Start'
    return humanizeSlug(event)
  }
  const path = raw.split('?')[0].replace(/\/+$/, '')
  const segs = path.split('/').filter(Boolean)
  if (!segs.length) return 'Home'
  const last = segs[segs.length - 1]
  // A form's start/form page: qualify with the service segment above it.
  if ((last === 'start' || last === 'form') && segs.length >= 2) {
    const step = last === 'start' ? 'Start' : 'Form'
    return qualifyGoal
      ? `${humanizeSlug(segs[segs.length - 2])} · ${step}`
      : step
  }
  return humanizeSlug(last)
}

/**
 * Build a layered flow (Sankey) from journey paths. Column `c` is the c-th step
 * into the visit (column 0 = entry page); links are visit counts between
 * consecutive steps. Nodes are keyed by (column, humanized **label**), so every
 * form's "Start"/"Form" merges into one node per column — the diagram reads as
 * entry → onward pages/goal, not one lane per form. Only real page paths and the
 * `form-start` goal are kept (tracking pseudo-events dropped, which collapses
 * A → pseudo → B into A → B), consecutive repeats are de-duped, the lowest-
 * traffic labels per column fold into "Other (N)", and every node carries its
 * share (`pct`) of total entry visits.
 */
export function shapeFlow(
  journeys: JourneyPath[],
  depth = 4,
  topPerColumn = 8,
): FlowData {
  // 1. per path → ordered labels (filtered, de-duped, capped), then count
  //    label→label links per source column.
  const rawLink = new Map<string, number>() // `${c}${SEP}${srcLabel}${SEP}${tgtLabel}`
  for (const j of journeys) {
    const labels: string[] = []
    for (const it of j.items) {
      if (!it) continue
      // Canonicalise the event suffix so a long-id form's compact start code
      // (#2682, `…:fstrt`) is still recognised as the Start goal.
      const isFormStart =
        !it.startsWith('/') &&
        canonicalEvent(it.slice(it.indexOf(':') + 1)) === 'form-start'
      if (!(it.startsWith('/') || isFormStart)) continue
      // Entry (column 0) must be a page, not the "Start" event — skip a
      // form-start until at least one page has been recorded.
      if (isFormStart && labels.length === 0) continue
      const label = humanizeStep(it)
      if (labels[labels.length - 1] === label) continue // drop consecutive repeat
      labels.push(label)
      if (labels.length >= depth) break
    }
    for (let c = 0; c + 1 < labels.length; c++) {
      const k = `${c}${SEP}${labels[c]}${SEP}${labels[c + 1]}`
      rawLink.set(k, (rawLink.get(k) ?? 0) + j.count)
    }
  }

  // 2. per-node in/out throughput and column, keyed by `${column}${SEP}${raw}`.
  const colOf = new Map<string, number>()
  const outSum = new Map<string, number>()
  const inSum = new Map<string, number>()
  for (const [k, v] of rawLink) {
    const [cStr, src, tgt] = k.split(SEP)
    const c = Number(cStr)
    const sId = `${c}${SEP}${src}`
    const tId = `${c + 1}${SEP}${tgt}`
    colOf.set(sId, c)
    colOf.set(tId, c + 1)
    outSum.set(sId, (outSum.get(sId) ?? 0) + v)
    inSum.set(tId, (inSum.get(tId) ?? 0) + v)
  }
  const throughput = (id: string) =>
    Math.max(outSum.get(id) ?? 0, inSum.get(id) ?? 0)

  // 3. keep the top N per column; everything else remaps to that column's Other.
  const byColumn = new Map<number, string[]>()
  for (const [id, c] of colOf) {
    const list = byColumn.get(c)
    if (list) list.push(id)
    else byColumn.set(c, [id])
  }
  const remap = new Map<string, string>()
  const otherCount = new Map<number, number>()
  for (const [c, ids] of byColumn) {
    ids.sort((a, b) => throughput(b) - throughput(a))
    ids.forEach((id, i) => {
      if (i < topPerColumn) remap.set(id, id)
      else {
        remap.set(id, `${c}${SEP}${OTHER}`)
        otherCount.set(c, (otherCount.get(c) ?? 0) + 1)
      }
    })
  }

  // 4. rebuild links against the remapped (bucketed) node ids. The merged key
  // joins two node ids (each of which contains SEP) with the distinct LSEP so
  // the split is unambiguous.
  const merged = new Map<string, number>() // `${srcId}${LSEP}${tgtId}` -> count
  for (const [k, v] of rawLink) {
    const [cStr, src, tgt] = k.split(SEP)
    const c = Number(cStr)
    const s = remap.get(`${c}${SEP}${src}`) ?? `${c}${SEP}${src}`
    const t = remap.get(`${c + 1}${SEP}${tgt}`) ?? `${c + 1}${SEP}${tgt}`
    if (s === t) continue // e.g. two tail pages that both fell into Other
    const mk = `${s}${LSEP}${t}`
    merged.set(mk, (merged.get(mk) ?? 0) + v)
  }

  // 5. materialise nodes + links; node value = max(in, out) of merged links.
  const mOut = new Map<string, number>()
  const mIn = new Map<string, number>()
  const links: FlowLink[] = []
  for (const [mk, v] of merged) {
    const [s, t] = mk.split(LSEP)
    mOut.set(s, (mOut.get(s) ?? 0) + v)
    mIn.set(t, (mIn.get(t) ?? 0) + v)
    links.push({ source: s, target: t, value: v })
  }
  const ids = new Set<string>([...mOut.keys(), ...mIn.keys()])
  const bare = [...ids].map((id) => {
    const [cStr, label] = id.split(SEP)
    const column = Number(cStr)
    return {
      id,
      column,
      label: label === OTHER ? `Other (${otherCount.get(column) ?? 0})` : label,
      value: Math.max(mOut.get(id) ?? 0, mIn.get(id) ?? 0),
    }
  })
  const total = bare
    .filter((n) => n.column === 0)
    .reduce((s, n) => s + n.value, 0)
  const nodes: FlowNode[] = bare.map((n) => ({
    ...n,
    pct: total ? n.value / total : 0,
  }))
  return { nodes, links, total }
}

/** One row of the "most common journeys" table: an ordered step breadcrumb. */
export interface JourneyRow {
  items: string[]
  sessions: number
  share: number
  /** raw path of the entry step, for the referrer lookup. */
  entryPath: string
  /** top referrers to the entry page (filled by fetchOverviewData). */
  topSources: SourceRow[]
}

/**
 * The top multi-step journeys as an ordered breadcrumb list (the table view of
 * the flow). Uses **page navigation only** — the `form-start` (and other) events
 * are dropped, so a form visit reads as its pages (service → Start → Form) and
 * the many event-ordering variants merge into one row instead of fragmenting.
 * Single-page visits (bounces) are excluded so the list is actual journeys, and
 * "Start"/"Form" are the `/…/start` and `/…/form` pages. Identical sequences
 * merge; share is of all listed (multi-step) journeys.
 */
export function shapeJourneyList(
  journeys: JourneyPath[],
  depth = 4,
  topN = 12,
): JourneyRow[] {
  const merged = new Map<
    string,
    { items: string[]; sessions: number; entryPath: string }
  >()
  for (const j of journeys) {
    const items: string[] = []
    let entryPath = ''
    for (const it of j.items) {
      // page paths only — events (…:form-start, chat-*, search) are excluded.
      if (!it || !it.startsWith('/')) continue
      // Qualify only the entry step, so a journey that begins on a `/…/start`
      // or `/…/form` page shows the service ("Get birth certificate · Start")
      // rather than a bare "Start"; later steps stay bare (context is implied).
      const first = items.length === 0
      const label = humanizeStep(it, first)
      if (items[items.length - 1] === label) continue
      if (first) entryPath = it.split('?')[0]
      items.push(label)
      if (items.length >= depth) break
    }
    // A journey is a path — drop single-page visits (bounces).
    if (items.length < 2) continue
    const key = items.join('␟')
    const existing = merged.get(key)
    if (existing) existing.sessions += j.count
    else merged.set(key, { items, sessions: j.count, entryPath })
  }
  const all = [...merged.values()].sort((a, b) => b.sessions - a.sessions)
  const total = all.reduce((s, r) => s + r.sessions, 0)
  return all.slice(0, topN).map((r) => ({
    ...r,
    topSources: [],
    share: total ? r.sessions / total : 0,
  }))
}

/** Drop the null padding the journey report returns and keep form-relevant paths. */
export function shapeJourneys(
  rows: JourneyPath[],
  formId: string,
): JourneyPath[] {
  return rows
    .map((j) => ({ items: j.items.filter(Boolean), count: j.count }))
    .filter(
      (j) => j.items.length > 0 && j.items.some((p) => p.includes(formId)),
    )
    .slice(0, 10)
}

// --- I/O -------------------------------------------------------------------

// Umami Cloud `/stats` returns flat counts (plus a `comparison` block for the
// previous period), e.g. { pageviews: 14442, visitors: 3889, ... }.
interface UmamiStats {
  pageviews?: number
  visitors?: number
  visits?: number
  bounces?: number
}

/** `yyyy-mm-dd` for an epoch-ms instant, in the site timezone. */
function ymd(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

// A slow or hung forms API must not stall the whole dashboard request. Cap each
// fetch and fall back to the same empty shape a non-ok response already returns
// (#2080). Non-timeout errors keep propagating as before.
const FORMS_FETCH_TIMEOUT_MS = 15_000

const isTimeout = (err: unknown): boolean =>
  err instanceof DOMException &&
  (err.name === 'TimeoutError' || err.name === 'AbortError')

export async function fetchFormList(cfg: UmamiConfig): Promise<FormListItem[]> {
  const base = cfg.formsApiUrl.replace(/\/+$/, '')
  // The timeout must cover the body read too, not just the connection — a
  // server that sends headers then stalls the body would otherwise abort
  // outside this catch and throw past the fallback (#2080). Only a timeout
  // falls back; other errors (network, malformed JSON) propagate as before.
  let body: { data?: { formId: string; title: string }[] }
  try {
    const res = await fetch(`${base}/form-definitions`, {
      signal: AbortSignal.timeout(FORMS_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return []
    body = (await res.json()) as {
      data?: { formId: string; title: string }[]
    }
  } catch (err) {
    if (isTimeout(err)) return []
    throw err
  }
  return (body.data ?? []).map((f) => ({ formId: f.formId, title: f.title }))
}

interface FormDefinition {
  title: string
  steps: { stepId: string; title: string }[]
  /** bare fieldId → human label, for the field-failure table. */
  labelByField: Record<string, string>
  /** `${fieldId}:${code}` → the full error message a user would see. */
  messageByFieldCode: Record<string, string>
}

export async function fetchFormDefinition(
  cfg: UmamiConfig,
  formId: string,
): Promise<FormDefinition> {
  const empty: FormDefinition = {
    title: formId,
    steps: [],
    labelByField: {},
    messageByFieldCode: {},
  }
  const base = cfg.formsApiUrl.replace(/\/+$/, '')
  // Timeout must cover the body read too (see fetchFormList) — return the empty
  // shape on a timeout at either phase; other errors propagate (#2080).
  let raw: unknown
  try {
    const res = await fetch(
      `${base}/form-definitions/${encodeURIComponent(formId)}`,
      { signal: AbortSignal.timeout(FORMS_FETCH_TIMEOUT_MS) },
    )
    if (!res.ok) return empty
    raw = await res.json()
  } catch (err) {
    if (isTimeout(err)) return empty
    throw err
  }
  const body = raw as {
    data?: {
      title?: string
      steps?: {
        stepId: string
        title: string
        elements?: {
          fieldId: string
          label?: string
          validations?: Record<string, { error?: string; value?: unknown }>
        }[]
      }[]
    }
  }
  const d = body.data
  if (!d) return empty

  const labelByField: Record<string, string> = {}
  const messageByFieldCode: Record<string, string> = {}
  for (const step of d.steps ?? []) {
    for (const el of step.elements ?? []) {
      if (el.label) labelByField[el.fieldId] = el.label
      // The message a user sees is the authored `error` if the recipe set one,
      // otherwise the runtime default — resolved from the same source the form
      // validator uses (defaultValidationMessage), so hover text matches.
      for (const [code, config] of Object.entries(el.validations ?? {})) {
        messageByFieldCode[`${el.fieldId}:${code}`] =
          config?.error ?? defaultValidationMessage(code, config)
      }
    }
  }

  return {
    title: d.title ?? formId,
    steps: (d.steps ?? []).map((s) => ({ stepId: s.stepId, title: s.title })),
    labelByField,
    messageByFieldCode,
  }
}

/**
 * Per-form distinct-visitor starts/completions via the funnel report — one call
 * per form, in parallel — keyed by form id. A form whose funnel call fails
 * degrades to zeros rather than failing the whole list.
 */
async function fetchFormFunnels(
  client: UmamiClient,
  cfg: UmamiConfig,
  forms: { formId: string; title: string }[],
  r: Range,
): Promise<Map<string, { starts: number; completed: number }>> {
  const entries = await Promise.all(
    forms.map(async (f) => {
      try {
        const rows = await client.reportFunnel(cfg.formsWebsiteId, {
          steps: buildFunnelSteps(f.formId),
          window: FUNNEL_WINDOW_MIN,
          range: r,
        })
        return [f.formId, funnelHeadline(rows)] as const
      } catch {
        return [f.formId, { starts: 0, completed: 0 }] as const
      }
    }),
  )
  return new Map(entries)
}

export async function fetchOverviewData(
  cfg: UmamiConfig,
  rangeKey: string,
): Promise<OverviewData> {
  const range = normaliseRange(rangeKey)
  return memoize(`overview:${range}`, TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const r = rangeForKey(range)
    const [statsRaw, urls, forms, landingEvents, journeyRows] =
      await Promise.all([
        client.stats(cfg.landingWebsiteId, r) as Promise<UmamiStats>,
        client.metricsUrls(cfg.landingWebsiteId, r),
        fetchFormList(cfg),
        client.metricsEvents(cfg.landingWebsiteId, r),
        client.reportJourney(cfg.landingWebsiteId, { steps: 4, range: r }),
      ])
    // Distinct-visitor starts/completions per form (funnel report per form),
    // matching the per-form detail page rather than raw event counts. Kick it
    // off now so it runs alongside the per-page referrer fetches below.
    const formHeadlinesP = fetchFormFunnels(client, cfg, forms, r)
    const topPages = urls
      .map((row) => ({
        path: row.x ?? row.name ?? '',
        pageviews: row.pageviews ?? row.y ?? 0,
        visitors: row.visitors ?? 0,
      }))
      .sort((a, b) => b.pageviews - a.pageviews)
      .slice(0, 10)
    // Top referrers per page (one call each, throttled) → the "Top source" col.
    const pages: PageRow[] = await Promise.all(
      topPages.map(async (p) => {
        let topSources: SourceRow[]
        try {
          topSources = buildSources(
            await client.metricsReferrers(cfg.landingWebsiteId, p.path, r),
            5,
          )
        } catch {
          topSources = []
        }
        return { ...p, topSources }
      }),
    )
    // Attach top referrers to each journey's entry page. Reuse the top-pages
    // referrers already fetched; fetch only for entry paths not among them.
    const journeys = shapeJourneyList(journeyRows)
    const srcByPath = new Map(pages.map((p) => [p.path, p.topSources]))
    const missing = [...new Set(journeys.map((j) => j.entryPath))].filter(
      (p) => p && !srcByPath.has(p),
    )
    await Promise.all(
      missing.map(async (p) => {
        try {
          srcByPath.set(
            p,
            buildSources(
              await client.metricsReferrers(cfg.landingWebsiteId, p, r),
              5,
            ),
          )
        } catch {
          srcByPath.set(p, [])
        }
      }),
    )

    const pageviews = statsRaw.pageviews ?? 0
    const sessions = statsRaw.visits ?? 0
    const searches = landingEvents.find((e) => e.x === 'search-submit')?.y ?? 0

    return {
      stats: {
        visitors: statsRaw.visitors ?? 0,
        pageviews,
        sessions,
        bounceRate: sessions ? (statsRaw.bounces ?? 0) / sessions : 0,
        avgStepsPerVisit: sessions ? pageviews / sessions : 0,
        searches,
      },
      pages,
      forms: shapeFormList(forms, await formHeadlinesP).sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
      flow: shapeFlow(journeyRows),
      journeys: journeys.map((j) => ({
        ...j,
        topSources: srcByPath.get(j.entryPath) ?? [],
      })),
      period: { start: ymd(r.startAt), end: ymd(r.endAt) },
      generatedAt: new Date().toISOString(),
      window: rangeLabel(range),
      range,
    }
  })
}

export interface FormsData {
  forms: FormListItem[]
  range: string
  window: string
}

/** All published forms with their starts/completion — the "Forms" tab. */
export async function fetchFormsData(
  cfg: UmamiConfig,
  rangeKey: string,
): Promise<FormsData> {
  const range = normaliseRange(rangeKey)
  return memoize(`forms:${range}`, TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const r = rangeForKey(range)
    const forms = await fetchFormList(cfg)
    const headlines = await fetchFormFunnels(client, cfg, forms, r)
    return {
      forms: shapeFormList(forms, headlines).sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
      range,
      window: rangeLabel(range),
    }
  })
}

// --- tools (#2119) ---------------------------------------------------------

/** One interactive tool's traffic on the "Tools" tab. */
export interface ToolRow {
  name: string
  /** the tool's canonical entry path (the row links here). */
  path: string
  pageviews: number
  /**
   * Distinct visitors, SUMMED across the tool's sub-pages. Exact for
   * single-page tools; may overcount a visitor who hits several sub-pages of a
   * multi-page tool — surfaced with a caveat in the UI. True prefix-distinct isn't available from Umami's per-path metrics.
   */
  visitors: number
  topSources: SourceRow[]
  /**
   * The tool's own events (ADR 0138). Null when it sent no `tool-result`,
   * `tool-action` or `tool-error` in the window — the "no tool events" state,
   * which every tool shows until it is instrumented.
   */
  events: ToolEventStats | null
}

/** What visitors got from a tool and did with it, from its `tool-*` events. */
export interface ToolEventStats {
  /** `tool-result` events. */
  results: number
  /**
   * Share of results with the tool's `noResultOutcome` (no matches, not
   * eligible), 0–1. Null when the tool has no such outcome or no results.
   */
  noResultRate: number | null
  /** The most-sent `tool-action`; null when there were none. */
  topAction: { action: string; count: number } | null
  /** `tool-error` events. */
  errors: number
  /** errors ÷ (results + errors), 0–1, like a form's submit error rate. */
  errorRate: number | null
}

/** The water outage alert sign-up funnel, as the water tool sends it (#3510). */
export interface WaterAlertFunnel {
  /** `tool-action` `subscribe-submit`. */
  submitted: number
  /** `tool-result` `subscribe-sent`: the confirmation email went out. */
  sent: number
  /** `tool-result` `confirmed` (sent only at step `confirm`). */
  confirmed: number
  /** `tool-result` `unsubscribed` (sent only at step `unsubscribe`). */
  unsubscribed: number
}

/** The tool-event value rows read from Umami for the Tools tab. */
export interface ToolEventRows {
  /** The `tool` values of each event: its count per tool, for every tool. */
  resultsByTool: EventDataValue[]
  actionsByTool: EventDataValue[]
  errorsByTool: EventDataValue[]
  /** Per tool, the `outcome` values of its `tool-result` events. */
  outcomes: Map<ToolId, EventDataValue[]>
  /** Per tool, the `action` values of its `tool-action` events. */
  actions: Map<ToolId, EventDataValue[]>
}

export interface ToolsData {
  tools: ToolRow[]
  /** Null when its breakdown could not be read from Umami. */
  waterAlerts: WaterAlertFunnel | null
  range: string
  window: string
}

/** The summed count of the rows whose value is `value`. */
function totalFor(rows: EventDataValue[], value: string): number {
  return rows
    .filter((r) => String(r.value) === value)
    .reduce((s, r) => s + r.total, 0)
}

/**
 * A tool's own outcome or action rows, or undefined when they can't be
 * trusted: the query failed (no entry), or the rows add up to more than the
 * tool's own count, as they would if Umami ignored the `tool` filter. The
 * table then shows a dash rather than a wrong number.
 */
function breakdownFor(
  rows: Map<ToolId, EventDataValue[]>,
  tool: Tool,
  count: number,
): EventDataValue[] | undefined {
  const own = rows.get(tool.id)
  return own && own.reduce((s, r) => s + r.total, 0) <= count ? own : undefined
}

/**
 * One tool's event metrics, or null when it sent no tool events (the empty
 * state). Counts come from the every-tool `tool` values; the no-result rate and
 * top action from the tool's own outcome and action values.
 */
export function shapeToolEvents(
  tool: Tool,
  rows: ToolEventRows,
): ToolEventStats | null {
  const results = totalFor(rows.resultsByTool, tool.id)
  const actionCount = totalFor(rows.actionsByTool, tool.id)
  const errors = totalFor(rows.errorsByTool, tool.id)
  if (results + actionCount + errors === 0) return null
  const outcomes = breakdownFor(rows.outcomes, tool, results)
  const top = breakdownFor(rows.actions, tool, actionCount)?.reduce<
    EventDataValue | undefined
  >((best, r) => (!best || r.total > best.total ? r : best), undefined)
  return {
    results,
    noResultRate:
      tool.noResultOutcome && outcomes && results
        ? totalFor(outcomes, tool.noResultOutcome) / results
        : null,
    topAction: top ? { action: String(top.value), count: top.total } : null,
    errors,
    errorRate: results + errors ? errors / (results + errors) : null,
  }
}

/**
 * The alert sign-up funnel from the water tool's outcome and action values.
 * Each outcome is sent at one step only, so the outcome alone tells a confirm
 * or unsubscribe result apart. Null when a breakdown query failed (no entry
 * although the tool sent that event), so the page says so instead of showing
 * zeros that read as "no emails went out".
 */
export function shapeWaterAlerts(rows: ToolEventRows): WaterAlertFunnel | null {
  const id: ToolId = 'water-outages'
  const outcomes = rows.outcomes.get(id)
  const actions = rows.actions.get(id)
  if (
    (!outcomes && totalFor(rows.resultsByTool, id) > 0) ||
    (!actions && totalFor(rows.actionsByTool, id) > 0)
  ) {
    return null
  }
  return {
    submitted: totalFor(actions ?? [], 'subscribe-submit'),
    sent: totalFor(outcomes ?? [], 'subscribe-sent'),
    confirmed: totalFor(outcomes ?? [], 'confirmed'),
    unsubscribed: totalFor(outcomes ?? [], 'unsubscribed'),
  }
}

/**
 * Roll landing URL rows up into one row per tool: sum pageviews + visitors for
 * every URL under the tool's route prefix, attach the tool's entry-path
 * referrers as its top source, and its event metrics. Pure — the caller
 * supplies the URL rows, a `primaryPath → referrers` map and the tool-event
 * rows, so it's fully unit-testable. Every tool is returned (zeroes when it has
 * no traffic) so owners always see it listed.
 */
export function shapeTools(
  tools: Tool[],
  urlRows: ExpandedRow[],
  sourcesByPath: Map<string, SourceRow[]>,
  eventRows: ToolEventRows,
): ToolRow[] {
  return tools.map((tool) => {
    let pageviews = 0
    let visitors = 0
    for (const row of urlRows) {
      const path = row.x ?? row.name ?? ''
      if (!pathMatchesPrefix(path, tool.prefix)) continue
      pageviews += row.pageviews ?? row.y ?? 0
      visitors += row.visitors ?? 0
    }
    return {
      name: tool.name,
      path: tool.primaryPath,
      pageviews,
      visitors,
      topSources: sourcesByPath.get(tool.primaryPath) ?? [],
      events: shapeToolEvents(tool, eventRows),
    }
  })
}

/**
 * Read the tool events (ADR 0138) from Umami. Each event's `tool` values give
 * every tool's count in one call. A tool's outcome and action values need
 * Umami's property filter, one call each, so they are read only for the tools
 * that sent that event in the window.
 */
async function fetchToolEventRows(
  client: UmamiClient,
  websiteId: string,
  tools: Tool[],
  r: Range,
): Promise<ToolEventRows> {
  const [resultsByTool, actionsByTool, errorsByTool] = await Promise.all([
    eventValues(client, websiteId, 'tool-result', 'tool', r),
    eventValues(client, websiteId, 'tool-action', 'tool', r),
    eventValues(client, websiteId, 'tool-error', 'tool', r),
  ])
  // A failed query leaves the tool out of the map (not `[]`), so its row shows
  // a dash instead of a believable 0%.
  const perTool = async (
    event: string,
    propertyName: string,
    byTool: EventDataValue[],
  ) => {
    const rows = new Map<ToolId, EventDataValue[]>()
    await Promise.all(
      tools
        .filter((tool) => totalFor(byTool, tool.id) > 0)
        .map(async (tool) => {
          try {
            rows.set(
              tool.id,
              await client.eventDataValues(websiteId, event, propertyName, r, {
                property: 'tool',
                equals: tool.id,
              }),
            )
          } catch {
            // left out: shown as a dash
          }
        }),
    )
    return rows
  }
  const [outcomes, actions] = await Promise.all([
    perTool('tool-result', 'outcome', resultsByTool),
    perTool('tool-action', 'action', actionsByTool),
  ])
  return { resultsByTool, actionsByTool, errorsByTool, outcomes, actions }
}

/** Per-tool pageview/visitor rollup + entry-page referrers — the "Tools" tab. */
export async function fetchToolsData(
  cfg: UmamiConfig,
  rangeKey: string,
): Promise<ToolsData> {
  const range = normaliseRange(rangeKey)
  return memoize(`tools:${range}`, TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const r = rangeForKey(range)
    const tools = liveTools()
    const [urlRows, eventRows] = await Promise.all([
      client.metricsUrls(cfg.landingWebsiteId, r),
      fetchToolEventRows(client, cfg.landingWebsiteId, tools, r),
    ])
    // One referrers call per tool entry path (throttled by the client), like
    // the Home tab's per-page "Top source".
    const sourcesByPath = new Map<string, SourceRow[]>()
    await Promise.all(
      tools.map(async (tool) => {
        try {
          sourcesByPath.set(
            tool.primaryPath,
            buildSources(
              await client.metricsReferrers(
                cfg.landingWebsiteId,
                tool.primaryPath,
                r,
              ),
              5,
            ),
          )
        } catch {
          sourcesByPath.set(tool.primaryPath, [])
        }
      }),
    )
    return {
      tools: shapeTools(tools, urlRows, sourcesByPath, eventRows),
      waterAlerts: shapeWaterAlerts(eventRows),
      range,
      window: rangeLabel(range),
    }
  })
}

// --- content pages (#2120) -------------------------------------------------

/** One live content page's traffic on the "Pages" tab. */
export interface PageListRow {
  path: string
  /** registry title. */
  title: string
  pageviews: number
  visitors: number
  /** linked form recipe id when the page is a guide page, else null. */
  formId: string | null
  topSources: SourceRow[]
}

export interface PagesData {
  pages: PageListRow[]
  range: string
  window: string
}

/** A landing content service's public URL: /category/slug (or /slug). */
function registryPath(entry: ServiceIndexEntry): string {
  return entry.category ? `/${entry.category}/${entry.slug}` : `/${entry.slug}`
}

function stripTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * The Pages list: landing Umami URL rows joined to the public services registry
 * on `/category/slug`. Only paths that match a public registry entry survive
 * (unmatched = preview/draft or non-content → dropped), minus the hard route
 * exclusions (tools/forms/system/`/start`). Trailing-slash URL variants merge.
 * Pure — the caller supplies the URL rows, registry, and per-path referrers.
 */
export function shapePages(
  urlRows: ExpandedRow[],
  registry: ServiceIndexEntry[],
  sourcesByPath: Map<string, SourceRow[]>,
): PageListRow[] {
  const byPath = new Map(registry.map((e) => [registryPath(e), e]))
  const agg = new Map<string, { pageviews: number; visitors: number }>()
  for (const row of urlRows) {
    const path = stripTrailingSlash(String(row.x ?? row.name ?? ''))
    if (!path || isExcludedPath(path) || !byPath.has(path)) continue
    const acc = agg.get(path) ?? { pageviews: 0, visitors: 0 }
    acc.pageviews += row.pageviews ?? row.y ?? 0
    acc.visitors += row.visitors ?? 0
    agg.set(path, acc)
  }
  return [...agg.entries()].map(([path, { pageviews, visitors }]) => {
    const entry = byPath.get(path)!
    return {
      path,
      title: entry.title,
      pageviews,
      visitors,
      formId: entry.formId ?? null,
      topSources: sourcesByPath.get(path) ?? [],
    }
  })
}

/**
 * The public content-service registry from the forms API (`GET /services`,
 * unauthenticated → public only). Mirrors fetchFormList: timeout or non-2xx →
 * `[]` (the tab degrades to empty), other errors propagate.
 */
export async function fetchServicesIndex(
  cfg: UmamiConfig,
): Promise<ServiceIndexEntry[]> {
  const base = cfg.formsApiUrl.replace(/\/+$/, '')
  let body: { data?: ServiceIndexEntry[] }
  try {
    const res = await fetch(`${base}/services`, {
      signal: AbortSignal.timeout(FORMS_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return []
    body = (await res.json()) as { data?: ServiceIndexEntry[] }
  } catch (err) {
    if (isTimeout(err)) return []
    throw err
  }
  return body.data ?? []
}

/** Live content pages + their traffic — the "Pages" tab (landing site). */
export async function fetchPagesData(
  cfg: UmamiConfig,
  rangeKey: string,
): Promise<PagesData> {
  const range = normaliseRange(rangeKey)
  return memoize(`pages:${range}`, TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const r = rangeForKey(range)
    const [urlRows, registry] = await Promise.all([
      client.metricsUrls(cfg.landingWebsiteId, r),
      fetchServicesIndex(cfg),
    ])
    // First pass yields the kept content-page paths; fetch each page's
    // referrers (throttled by the client), then re-shape with the sources.
    const kept = shapePages(urlRows, registry, new Map())
    const sourcesByPath = new Map<string, SourceRow[]>()
    await Promise.all(
      kept.map(async (p) => {
        try {
          sourcesByPath.set(
            p.path,
            buildSources(
              await client.metricsReferrers(cfg.landingWebsiteId, p.path, r),
              5,
            ),
          )
        } catch {
          sourcesByPath.set(p.path, [])
        }
      }),
    )
    return {
      pages: shapePages(urlRows, registry, sourcesByPath).sort(
        (a, b) => b.pageviews - a.pageviews,
      ),
      range,
      window: rangeLabel(range),
    }
  })
}

/** Search queries + click-through for the "Search" tab (landing site). */
export async function fetchSearchData(
  cfg: UmamiConfig,
  rangeKey: string,
): Promise<SearchData> {
  const range = normaliseRange(rangeKey)
  return memoize(`search:${range}`, TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const r = rangeForKey(range)
    const wid = cfg.landingWebsiteId
    const [queryRows, resultsRows, clickRows, noResultRows] = await Promise.all(
      [
        eventValues(client, wid, 'search', 'query', r),
        eventValues(client, wid, 'search', 'results', r),
        eventValues(client, wid, 'search-result-click', 'query', r),
        eventValues(client, wid, 'search-no-results', 'query', r),
      ],
    )
    return {
      ...shapeSearch(queryRows, resultsRows, clickRows, noResultRows),
      generatedAt: new Date().toISOString(),
      window: rangeLabel(range),
      range,
    }
  })
}

export async function fetchFormDetailData(
  cfg: UmamiConfig,
  formId: string,
  rangeKey: string,
): Promise<FormDetailData> {
  const range = normaliseRange(rangeKey)
  return memoize(`form:${formId}:${range}`, TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const r = rangeForKey(range)
    const [
      funnelRows,
      visitRows,
      events,
      stepViews,
      duration,
      errorCount,
      fieldErrorsRaw,
      submitErrRows,
      paymentReturnedRows,
      def,
    ] = await Promise.all([
      client.reportFunnel(cfg.formsWebsiteId, {
        steps: buildFunnelSteps(formId),
        window: FUNNEL_WINDOW_MIN,
        range: r,
      }),
      client.reportFunnel(cfg.formsWebsiteId, {
        steps: buildVisitFunnelSteps(formId),
        window: FUNNEL_WINDOW_MIN,
        range: r,
      }),
      client.metricsEvents(cfg.formsWebsiteId, r),
      eventValues(
        client,
        cfg.formsWebsiteId,
        eventName(formId, 'form-step-view'),
        'step',
        r,
      ),
      eventValues(
        client,
        cfg.formsWebsiteId,
        eventName(formId, 'form-submit'),
        'duration_seconds',
        r,
      ),
      eventValues(
        client,
        cfg.formsWebsiteId,
        eventName(formId, 'form-validation-error'),
        'errorCount',
        r,
      ),
      eventValues(
        client,
        cfg.formsWebsiteId,
        eventName(formId, 'form-validation-error'),
        'fieldErrors',
        r,
      ),
      eventValues(
        client,
        cfg.formsWebsiteId,
        eventName(formId, 'form-submit-error'),
        'errors',
        r,
      ),
      eventValues(
        client,
        cfg.formsWebsiteId,
        eventName(formId, 'payment-returned'),
        'outcome',
        r,
      ),
      fetchFormDefinition(cfg, formId),
    ])

    // Headline: distinct visitors from the funnel report (start → … → submit).
    const { starts, completed } = funnelHeadline(funnelRows)
    const completionPct = starts
      ? Math.round((completed / starts) * 1000) / 10
      : 0
    // Visits = distinct visitors who viewed the form page (visit funnel step 0).
    // starts comes from the separate 3-step funnel above (kept identical to the
    // summary list), so the ratio spans two funnels; cap at 100% for the rare
    // case where a start has no recorded page view in-window (e.g. a deep link).
    const visits = visitRows[0]?.visitors ?? 0
    const visitsToStartsPct = visits
      ? Math.min(100, Math.round((starts / visits) * 1000) / 10)
      : 0
    const avgDuration = weightedAverage(duration)
    const totalFieldErrors = weightedSum(errorCount)

    // Per-step view counts keyed by stepId (the `form-step-view` `step`
    // property), for the titled step funnel below.
    const reachedByStep: Record<string, number> = {}
    for (const v of stepViews) {
      const id = String(v.value)
      reachedByStep[id] = (reachedByStep[id] ?? 0) + v.total
    }

    // Event-count aggregation for the counters and field/reason tables (per-step
    // distinct isn't available — these are event counts). A >44-char form id is
    // emitted under a hashed key (#2682), so aggregateFormEvents groups it there;
    // look it up by the same key eventName() would derive.
    const entry = aggregateFormEvents(events).get(eventFormKey(formId)) ?? {
      counts: {},
      steps: [],
    }

    // Which fields fail and why — parse the `fieldErrors` pairs, then resolve
    // each field's label and each reason's full message from the contract.
    const fieldFailures: FieldFailure[] = tallyFieldErrors(fieldErrorsRaw).map(
      (f) => ({
        fieldId: f.field,
        label: def.labelByField[f.field] ?? f.field,
        count: f.count,
        reasons: f.reasons.map((rn) => ({
          code: rn.code,
          message: def.messageByFieldCode[`${f.field}:${rn.code}`] ?? '',
          count: rn.count,
        })),
      }),
    )

    return {
      formId,
      title: def.title,
      visits,
      starts,
      completed,
      completionPct,
      visitsToStartsPct,
      avgDurationSeconds: avgDuration === null ? null : Math.round(avgDuration),
      totalFieldErrors,
      funnel: buildStepFunnel(
        entry.counts['form-start'] ?? 0,
        entry.counts['form-submit'] ?? 0,
        def.steps,
        reachedByStep,
        {
          reviewCount: entry.counts['form-review'] ?? 0,
          confirmationCount: entry.counts['form-confirmation-view'] ?? 0,
          paymentInitiatedCount: entry.counts['payment-initiated'] ?? 0,
          // `payment-returned` splits by outcome; the funnel's terminal payment
          // stage is the successful returns only.
          paymentSuccessCount: paymentReturnedRows
            .filter((v) => String(v.value) === 'success')
            .reduce((s, v) => s + v.total, 0),
        },
      ),
      fieldFailures,
      submitError: shapeSubmitError(
        entry.counts['form-submit'] ?? 0,
        entry.counts['form-submit-error'] ?? 0,
        submitErrRows,
      ),
      generatedAt: new Date().toISOString(),
      window: rangeLabel(range),
      range,
    }
  })
}

/** eventDataValues that degrades to [] on error (an event may be absent). */
async function eventValues(
  client: UmamiClient,
  websiteId: string,
  event: string,
  propertyName: string,
  r: Range,
): Promise<EventDataValue[]> {
  try {
    return await client.eventDataValues(websiteId, event, propertyName, r)
  } catch {
    return []
  }
}
