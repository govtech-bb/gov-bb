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
    default: // past-30-days
      return { startAt: startOfDayInTz(TZ, now, 29), endAt }
  }
}

// --- shared shapes ---------------------------------------------------------

export interface FormListItem {
  formId: string
  title: string
}
export interface SiteStats {
  visitors: number
  pageviews: number
}
export interface OverviewData {
  stats: SiteStats
  pages: PageRow[]
  forms: FormListItem[]
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
    const [statsRaw, urls, forms] = await Promise.all([
      client.stats(cfg.landingWebsiteId, r) as Promise<UmamiStats>,
      client.metricsUrls(cfg.landingWebsiteId, r),
      fetchFormList(cfg),
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
      forms: forms.sort((a, b) => a.title.localeCompare(b.title)),
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
