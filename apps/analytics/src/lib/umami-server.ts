// Server-only: reads Umami in real time for the /analytics dashboard. Called
// from the TanStack Start server functions in report.ts (which supply the
// resolved config), so the API key stays on the server and never reaches the
// browser. No DB, no snapshot — the site overview and each form's
// funnel/journey are fetched on demand and deduped by a short in-memory TTL
// (cache.ts). This module deliberately has no `nitro/runtime-config` import so
// its pure shapers stay unit-testable.
import {
  UmamiClient,
  type FunnelStepInput,
  type FunnelStepResult,
  type JourneyPath,
  type FunnelStage,
  type PageRow,
} from '@govtech-bb/umami-analytics'
import { memoize } from './cache'

const TTL_MS = 60_000
// Max minutes Umami allows between funnel steps. A form start→submit can span a
// long single session, so keep this generous.
const FUNNEL_WINDOW_MIN = 60 * 24

export interface UmamiConfig {
  apiKey: string
  landingWebsiteId: string
  formsWebsiteId: string
  formsApiUrl: string
}

export function isConfigured(cfg: UmamiConfig): boolean {
  return Boolean(cfg.apiKey && cfg.landingWebsiteId && cfg.formsWebsiteId)
}

function last30(): { startAt: number; endAt: number } {
  const endAt = Date.now()
  return { startAt: endAt - 30 * 24 * 60 * 60 * 1000, endAt }
}

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
}
export interface FormDetailData {
  funnel: FunnelStage[]
  journey: JourneyPath[]
  submitErrorRate: number | null
}

/** Coarse funnel steps for a form: start → review → submit (event names). */
export function buildFunnelSteps(formId: string): FunnelStepInput[] {
  return [
    { type: 'event', value: `${formId}:form-start` },
    { type: 'event', value: `${formId}:form-review` },
    { type: 'event', value: `${formId}:form-submit` },
  ]
}

const STAGE_LABELS = ['Start', 'Review', 'Submit']

export function shapeFormDetail(
  funnelRows: FunnelStepResult[],
  journey: JourneyPath[],
  extra: { starts: number; errors: number },
): FormDetailData {
  const funnel: FunnelStage[] = funnelRows.map((row, i) => ({
    label: STAGE_LABELS[i] ?? row.value,
    count: row.visitors,
    // Umami reports dropoff as a 0–1 fraction; the UI wants a 0–100 percentage.
    dropoffPct: row.dropoff == null ? 0 : Math.round(row.dropoff * 1000) / 10,
  }))
  const submitErrorRate = extra.starts ? extra.errors / extra.starts : null
  return { funnel, journey, submitErrorRate }
}

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

export async function fetchOverviewData(
  cfg: UmamiConfig,
): Promise<OverviewData> {
  return memoize('overview', TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const range = last30()
    const [statsRaw, urls, forms] = await Promise.all([
      client.stats(cfg.landingWebsiteId, range) as Promise<UmamiStats>,
      client.metricsUrls(cfg.landingWebsiteId, range),
      fetchFormList(cfg),
    ])
    const pages: PageRow[] = urls
      .map((r) => ({
        path: r.x ?? r.name ?? '',
        pageviews: r.pageviews ?? r.y ?? 0,
        visitors: r.visitors ?? 0,
        topSources: [],
      }))
      .sort((a, b) => b.pageviews - a.pageviews)
      .slice(0, 10)
    return {
      stats: {
        visitors: statsRaw.visitors ?? 0,
        pageviews: statsRaw.pageviews ?? 0,
      },
      pages,
      forms: forms.sort((a, b) => a.title.localeCompare(b.title)),
    }
  })
}

export async function fetchFormDetailData(
  cfg: UmamiConfig,
  formId: string,
): Promise<FormDetailData> {
  return memoize(`form:${formId}`, TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const range = last30()
    const [funnelRows, journey, events] = await Promise.all([
      client.reportFunnel(cfg.formsWebsiteId, {
        steps: buildFunnelSteps(formId),
        window: FUNNEL_WINDOW_MIN,
        range,
      }),
      client.reportJourney(cfg.formsWebsiteId, { steps: 5, range }),
      client.metricsEvents(cfg.formsWebsiteId, range),
    ])
    const starts = events.find((e) => e.x === `${formId}:form-start`)?.y ?? 0
    const errors =
      events.find((e) => e.x === `${formId}:form-submit-error`)?.y ?? 0
    return shapeFormDetail(funnelRows, journey, { starts, errors })
  })
}
