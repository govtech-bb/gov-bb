// Server-only: reads Umami in real time for the /analytics dashboard. Called
// from the TanStack Start server functions in report.ts (which supply the
// resolved config), so the API key stays on the server and never reaches the
// browser. No DB, no snapshot — the site overview and each form's detail are
// fetched on demand and deduped by a short in-memory TTL (cache.ts). This
// module deliberately has no `nitro/runtime-config` import so its pure shapers
// stay unit-testable.
import {
  UmamiClient,
  buildSources,
  startOfDayInTz,
  tzOffsetMs,
  type EventDataValue,
  type FunnelStage,
  type FunnelStepInput,
  type FunnelStepResult,
  type JourneyPath,
  type MetricRow,
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
  /** `form-start` events in the window. */
  starts: number
  /** successful `form-submit` events in the window. */
  completions: number
  /** completions ÷ starts × 100, 1dp; 0 when no starts. */
  completionPct: number
}
export interface SiteStats {
  visitors: number
  pageviews: number
}
export interface OverviewData {
  stats: SiteStats
  pages: PageRow[]
  forms: FormListItem[]
  /** layered visitor-flow (Sankey) of the first few steps into a visit. */
  flow: FlowData
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

export interface FormDetailData {
  formId: string
  title: string
  funnel: FunnelStage[]
  steps: StepStat[]
  submitError: SubmitError
  journey: JourneyPath[]
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

/**
 * Attach per-form starts (`form-start`) and completions (`form-submit`) from a
 * single forms-website event-metrics pull. Event counts (a quick per-form
 * summary); the per-form page's funnel is the deduped, distinct-visitor view.
 */
export function shapeFormList(
  forms: { formId: string; title: string }[],
  events: MetricRow[],
): FormListItem[] {
  const starts = new Map<string, number>()
  const submits = new Map<string, number>()
  for (const e of events) {
    const i = e.x.indexOf(':')
    if (i < 0) continue
    const id = e.x.slice(0, i)
    const event = e.x.slice(i + 1)
    if (event === 'form-start') starts.set(id, (starts.get(id) ?? 0) + e.y)
    else if (event === 'form-submit')
      submits.set(id, (submits.get(id) ?? 0) + e.y)
  }
  return forms.map((f) => {
    const s = starts.get(f.formId) ?? 0
    const c = submits.get(f.formId) ?? 0
    return {
      ...f,
      starts: s,
      completions: c,
      completionPct: s ? Math.round((c / s) * 1000) / 10 : 0,
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

/** Turn a raw journey step (path or `<form>:<event>`) into a short label. */
export function humanizeStep(raw: string): string {
  if (!raw) return ''
  if (!raw.startsWith('/') && raw.includes(':')) {
    const event = raw.slice(raw.indexOf(':') + 1)
    return event === 'form-start' ? 'Start' : humanizeSlug(event)
  }
  const path = raw.split('?')[0].replace(/\/+$/, '')
  const segs = path.split('/').filter(Boolean)
  return segs.length ? humanizeSlug(segs[segs.length - 1]) : 'Home'
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

export async function fetchOverviewData(
  cfg: UmamiConfig,
  rangeKey: string,
): Promise<OverviewData> {
  const range = normaliseRange(rangeKey)
  return memoize(`overview:${range}`, TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const r = rangeForKey(range)
    const [statsRaw, urls, forms, formEvents, journeyRows] = await Promise.all([
      client.stats(cfg.landingWebsiteId, r) as Promise<UmamiStats>,
      client.metricsUrls(cfg.landingWebsiteId, r),
      fetchFormList(cfg),
      client.metricsEvents(cfg.formsWebsiteId, r),
      client.reportJourney(cfg.landingWebsiteId, { steps: 4, range: r }),
    ])
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
        let topSources: SourceRow[] = []
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
    return {
      stats: {
        visitors: statsRaw.visitors ?? 0,
        pageviews: statsRaw.pageviews ?? 0,
      },
      pages,
      forms: shapeFormList(forms, formEvents).sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
      flow: shapeFlow(journeyRows),
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
    const [funnelRows, journeyRows, events, reachedRows, reasonRows, def] =
      await Promise.all([
        client.reportFunnel(cfg.formsWebsiteId, {
          steps: buildFunnelSteps(formId),
          window: FUNNEL_WINDOW_MIN,
          range: r,
        }),
        client.reportJourney(cfg.formsWebsiteId, { steps: 5, range: r }),
        client.metricsEvents(cfg.formsWebsiteId, r),
        client.eventDataValues(
          cfg.formsWebsiteId,
          `${formId}:form-step-view`,
          'step',
          r,
        ),
        client.eventDataValues(
          cfg.formsWebsiteId,
          `${formId}:form-submit-error`,
          'errors',
          r,
        ),
        fetchFormDefinition(cfg, formId),
      ])

    const submitTotal =
      events.find((e) => e.x === `${formId}:form-submit`)?.y ?? 0
    const errorTotal =
      events.find((e) => e.x === `${formId}:form-submit-error`)?.y ?? 0
    const reachedByStep: Record<string, number> = {}
    for (const row of reachedRows) reachedByStep[String(row.value)] = row.total

    return {
      formId,
      title: def.title,
      funnel: shapeFunnel(funnelRows),
      steps: shapeSteps(def.steps, reachedByStep),
      submitError: shapeSubmitError(submitTotal, errorTotal, reasonRows),
      journey: shapeJourneys(journeyRows, formId),
      generatedAt: new Date().toISOString(),
      window: rangeLabel(range),
      range,
    }
  })
}
