// Server functions for the /analytics page. These run on the server (SSR +
// server-fn RPC), read Umami in real time, and return aggregate-only data — the
// browser never talks to Umami and never sees the API key. No DB, no snapshot:
// the overview loads with the page, each form's detail loads on its own page.
import { createServerFn } from '@tanstack/react-start'
import { useRuntimeConfig } from 'nitro/runtime-config'
import {
  fetchFormDetailData,
  fetchFormsData,
  fetchOverviewData,
  fetchSearchData,
  isConfigured,
  normaliseRange,
  rangeLabel,
  type FormDetailData,
  type FormsData,
  type OverviewData,
  type SearchData,
  type UmamiConfig,
} from './umami-server'

const DEFAULT_FORMS_API = 'https://forms.api.sandbox.alpha.gov.bb'

// Resolve the server-only config. Build-baked into the Nitro runtime config
// (see vite.config.ts); the `process.env` fallback covers `nitro dev`, where
// `.env` is loaded. Never runs in the browser.
function getConfig(): UmamiConfig {
  const c = useRuntimeConfig() as Record<string, string | undefined>
  return {
    apiKey: c.umamiApiKey || process.env.UMAMI_API_KEY || '',
    landingWebsiteId:
      c.umamiLandingWebsiteId || process.env.UMAMI_LANDING_WEBSITE_ID || '',
    formsWebsiteId:
      c.umamiFormsWebsiteId || process.env.UMAMI_FORMS_WEBSITE_ID || '',
    formsApiUrl:
      c.formsApiUrl || process.env.VITE_FORMS_API_URL || DEFAULT_FORMS_API,
  }
}

export type OverviewPayload = { configured: boolean } & OverviewData

function emptyOverview(range: string): OverviewPayload {
  return {
    configured: false,
    stats: {
      visitors: 0,
      pageviews: 0,
      sessions: 0,
      bounceRate: 0,
      avgStepsPerVisit: 0,
      searches: 0,
    },
    pages: [],
    forms: [],
    flow: { nodes: [], links: [], total: 0 },
    journeys: [],
    period: { start: '', end: '' },
    generatedAt: '',
    window: rangeLabel(range),
    range,
  }
}

function emptyDetail(formId: string, range: string): FormDetailData {
  return {
    formId,
    title: formId,
    visits: 0,
    starts: 0,
    completed: 0,
    completionPct: 0,
    visitsToStartsPct: 0,
    avgDurationSeconds: null,
    totalFieldErrors: 0,
    funnel: [],
    fieldFailures: [],
    submitError: { total: 0, attempts: 0, rate: null, byReason: [] },
    generatedAt: '',
    window: rangeLabel(range),
    range,
  }
}

/**
 * Site overview + form list for a date range. Runs server-side on the initial
 * SSR load. Degrades to an unconfigured/empty payload (never throws) so the page
 * always renders.
 */
export const fetchOverview = createServerFn({ method: 'GET' })
  .validator((raw: unknown) =>
    normaliseRange(raw == null ? undefined : String(raw)),
  )
  .handler(async ({ data: range }): Promise<OverviewPayload> => {
    const cfg = getConfig()
    if (!isConfigured(cfg)) return emptyOverview(range)
    try {
      const data = await fetchOverviewData(cfg, range)
      return { configured: true, ...data }
    } catch {
      return emptyOverview(range)
    }
  })

export type FormsPayload = { configured: boolean } & FormsData

/** All published forms + their stats for the "Forms" tab. */
export const fetchForms = createServerFn({ method: 'GET' })
  .validator((raw: unknown) =>
    normaliseRange(raw == null ? undefined : String(raw)),
  )
  .handler(async ({ data: range }): Promise<FormsPayload> => {
    const cfg = getConfig()
    const empty = {
      configured: false,
      forms: [],
      range,
      window: rangeLabel(range),
    }
    if (!isConfigured(cfg)) return empty
    try {
      const data = await fetchFormsData(cfg, range)
      return { configured: true, ...data }
    } catch {
      return empty
    }
  })

export type SearchPayload = { configured: boolean } & SearchData

/** Search queries + click-through for the "Search" tab. */
export const fetchSearch = createServerFn({ method: 'GET' })
  .validator((raw: unknown) =>
    normaliseRange(raw == null ? undefined : String(raw)),
  )
  .handler(async ({ data: range }): Promise<SearchPayload> => {
    const cfg = getConfig()
    const empty: SearchPayload = {
      configured: false,
      searches: 0,
      clicks: 0,
      ctr: 0,
      zeroResultRate: 0,
      queries: [],
      generatedAt: '',
      window: rangeLabel(range),
      range,
    }
    if (!isConfigured(cfg)) return empty
    try {
      return { configured: true, ...(await fetchSearchData(cfg, range)) }
    } catch {
      return empty
    }
  })

/**
 * One form's funnel + per-step + submit reliability + journeys for a date range.
 * Degrades to empty data on error rather than throwing.
 */
export const fetchFormDetail = createServerFn({ method: 'GET' })
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as { formId?: unknown; range?: unknown }
    return {
      formId: String(o.formId ?? ''),
      range: normaliseRange(o.range == null ? undefined : String(o.range)),
    }
  })
  .handler(async ({ data }): Promise<FormDetailData> => {
    const cfg = getConfig()
    if (!isConfigured(cfg)) return emptyDetail(data.formId, data.range)
    try {
      return await fetchFormDetailData(cfg, data.formId, data.range)
    } catch {
      return emptyDetail(data.formId, data.range)
    }
  })
