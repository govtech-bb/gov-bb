// Server-only: reads Umami in real time for the /analytics dashboard. Called
// from the TanStack Start server functions in report.ts (which supply the
// resolved config), so the API key stays on the server and never reaches the
// browser. No DB, no snapshot — the site overview and each form's detail are
// fetched on demand and deduped by a short in-memory TTL (cache.ts). This
// module deliberately has no `nitro/runtime-config` import so its pure shapers
// stay unit-testable.
import {
  UmamiClient,
  aggregateFormEvents,
  buildFormDetail,
  buildSources,
  startOfDayInTz,
  tzOffsetMs,
  weightedAverage,
  weightedSum,
  type EventDataValue,
  type FunnelStage,
  type FunnelStepInput,
  type FunnelStepResult,
  type JourneyPath,
  type PageRow,
  type Range,
  type SourceRow,
} from '@govtech-bb/umami-analytics'
import { memoize } from './cache'

const TTL_MS = 60_000
// Max minutes Umami allows between funnel steps. A form start→submit can span a
// long single session, so keep this generous.
const FUNNEL_WINDOW_MIN = 60 * 24
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

/** One step's reached/completed counts (#1915). Event-view counts, not distinct. */
export interface StepStat {
  stepId: string
  title: string
  reached: number
  completed: number
  abandoned: number
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

export interface FormDetailData {
  formId: string
  title: string
  // Headline — distinct visitors (Umami funnel report).
  starts: number
  completed: number
  completionPct: number
  avgDurationSeconds: number | null
  // Secondary stats (event counts).
  totalFieldErrors: number
  avgFieldErrors: number
  stepBack: number
  stepEdit: number
  reviewed: number
  /** Start → Step N → Submit, with step-over-step % (dropoffPct). Event counts. */
  funnel: FunnelStage[]
  /** Each defined step (in order) with its title and view count (#1915). */
  steps: StepStat[]
  /** why fields fail (validation reason codes/messages), descending. */
  validationReasons: FieldCount[]
  /** submit reliability (#1916). */
  submitError: SubmitError
  generatedAt: string
  window: string
  range: string
}

// --- pure shapers (unit-tested) --------------------------------------------

export function buildFunnelSteps(formId: string): FunnelStepInput[] {
  return [
    { type: 'event', value: `${formId}:form-start` },
    { type: 'event', value: `${formId}:form-review` },
    { type: 'event', value: `${formId}:form-submit` },
  ]
}

const STAGE_LABELS = ['Start', 'Review', 'Submit']

export function shapeFunnel(funnelRows: FunnelStepResult[]): FunnelStage[] {
  return funnelRows.map((row, i) => ({
    label: STAGE_LABELS[i] ?? row.value,
    count: row.visitors,
    dropoffPct: row.dropoff == null ? 0 : Math.round(row.dropoff * 1000) / 10,
  }))
}

/**
 * Per-step reached-vs-completed (#1915). `reached` is the `form-step-view` count
 * per step (declared order); `completed` is the reached count of the next step —
 * advancing is completing. The final step has no successor → fully completed.
 */
export function shapeSteps(
  orderedSteps: { stepId: string; title: string }[],
  reachedByStep: Record<string, number>,
): StepStat[] {
  return orderedSteps.map((s, i) => {
    const reached = reachedByStep[s.stepId] ?? 0
    const next = orderedSteps[i + 1]
    const completed = next ? (reachedByStep[next.stepId] ?? 0) : reached
    return {
      stepId: s.stepId,
      title: s.title,
      reached,
      completed,
      abandoned: Math.max(0, reached - completed),
    }
  })
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

/** Distinct-visitor starts + completions from a form's funnel report rows. */
export function funnelHeadline(rows: FunnelStepResult[]): {
  starts: number
  completed: number
} {
  return {
    starts: rows[0]?.visitors ?? 0,
    completed: rows[rows.length - 1]?.visitors ?? 0,
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
    const event = raw.slice(raw.indexOf(':') + 1)
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
      const isFormStart = it.endsWith(':form-start')
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

async function fetchFormList(cfg: UmamiConfig): Promise<FormListItem[]> {
  const base = cfg.formsApiUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/form-definitions`)
  if (!res.ok) return []
  const body = (await res.json()) as {
    data?: { formId: string; title: string }[]
  }
  return (body.data ?? []).map((f) => ({ formId: f.formId, title: f.title }))
}

async function fetchFormDefinition(
  cfg: UmamiConfig,
  formId: string,
): Promise<{ title: string; steps: { stepId: string; title: string }[] }> {
  const base = cfg.formsApiUrl.replace(/\/+$/, '')
  const res = await fetch(
    `${base}/form-definitions/${encodeURIComponent(formId)}`,
  )
  if (!res.ok) return { title: formId, steps: [] }
  const body = (await res.json()) as {
    data?: { title?: string; steps?: { stepId: string; title: string }[] }
  }
  const d = body.data
  return {
    title: d?.title ?? formId,
    steps: (d?.steps ?? []).map((s) => ({ stepId: s.stepId, title: s.title })),
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
      events,
      stepViews,
      duration,
      errorCount,
      errorTypes,
      submitErrRows,
      def,
    ] = await Promise.all([
      client.reportFunnel(cfg.formsWebsiteId, {
        steps: buildFunnelSteps(formId),
        window: FUNNEL_WINDOW_MIN,
        range: r,
      }),
      client.metricsEvents(cfg.formsWebsiteId, r),
      eventValues(client, cfg, `${formId}:form-step-view`, 'step', r),
      eventValues(client, cfg, `${formId}:form-submit`, 'duration_seconds', r),
      eventValues(
        client,
        cfg,
        `${formId}:form-validation-error`,
        'errorCount',
        r,
      ),
      eventValues(
        client,
        cfg,
        `${formId}:form-validation-error`,
        'errorTypes',
        r,
      ),
      eventValues(client, cfg, `${formId}:form-submit-error`, 'errors', r),
      fetchFormDefinition(cfg, formId),
    ])

    // Headline: distinct visitors from the funnel report (start → … → submit).
    const { starts, completed } = funnelHeadline(funnelRows)
    const completionPct = starts
      ? Math.round((completed / starts) * 1000) / 10
      : 0
    const avgDuration = weightedAverage(duration)
    const totalFieldErrors = weightedSum(errorCount)

    // Per-step breakdown keyed by stepId (the `form-step-view` `step` property),
    // laid out in the form's declared order with titles. Unlike the funnel's
    // positional "Step N" (which branching makes visitor-relative), this maps to
    // a specific defined step, so a skipped conditional step reads as fewer/zero.
    const reachedByStep: Record<string, number> = {}
    for (const v of stepViews) {
      const id = String(v.value)
      reachedByStep[id] = (reachedByStep[id] ?? 0) + v.total
    }
    const steps = shapeSteps(def.steps, reachedByStep)

    // Event-count aggregation for the step funnel, counters and field/reason
    // tables (per-step distinct isn't available — these are event counts).
    const entry = aggregateFormEvents(events).get(formId) ?? {
      counts: {},
      steps: [],
    }
    const detail = buildFormDetail(formId, entry, {
      duration,
      errorCount,
      fields: [],
      errorTypes,
    })

    return {
      formId,
      title: def.title,
      starts,
      completed,
      completionPct,
      avgDurationSeconds: avgDuration === null ? null : Math.round(avgDuration),
      totalFieldErrors,
      avgFieldErrors: starts
        ? Math.round((totalFieldErrors / starts) * 100) / 100
        : 0,
      stepBack: detail.stepBack,
      stepEdit: detail.stepEdit,
      reviewed: detail.review,
      funnel: detail.funnel,
      steps,
      validationReasons: detail.errorTypes,
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

/** eventDataValues that degrades to [] on error (a form may lack a given event). */
async function eventValues(
  client: UmamiClient,
  cfg: UmamiConfig,
  event: string,
  propertyName: string,
  r: Range,
): Promise<EventDataValue[]> {
  try {
    return await client.eventDataValues(
      cfg.formsWebsiteId,
      event,
      propertyName,
      r,
    )
  } catch {
    return []
  }
}
