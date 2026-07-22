// Server functions for the /analytics page. These run on the server (SSR +
// server-fn RPC), read Umami in real time, and return aggregate-only data — the
// browser never talks to Umami and never sees the API key. No DB, no snapshot:
// the overview loads with the page, each form's detail loads on its own page.
import { createServerFn } from '@tanstack/react-start'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { getCachedSecretJson } from '@govtech-bb/aws-secrets'
import {
  fetchFormDetailData,
  fetchFormsData,
  fetchOverviewData,
  isConfigured,
  normaliseRange,
  rangeLabel,
  type FormDetailData,
  type FormsData,
  type OverviewData,
  type UmamiConfig,
} from './umami-server'

const DEFAULT_FORMS_API = 'https://forms.api.sandbox.alpha.gov.bb'

// Resolve the API key. Prod uses the Secrets Manager pattern (chat /
// feature_flagging): only the secret's ARN is baked in; the SSR Lambda fetches
// the value at runtime under the compute role, keeping the plaintext out of the
// bundle and the Amplify env vars. Sandbox/dev fall back to the build-baked key
// (its pipeline still injects UMAMI_API_KEY) or `process.env` for `nitro dev`.
async function resolveApiKey(
  c: Record<string, string | undefined>,
): Promise<string> {
  const arn =
    c.analyticsUmamiSecretArn || process.env.ANALYTICS_UMAMI_SECRET_ARN
  if (arn) {
    try {
      const json = await getCachedSecretJson<{ umami_api_key?: string }>(arn)
      if (json.umami_api_key) return json.umami_api_key
    } catch {
      // Fall through to the baked/env fallback so the page still renders.
    }
  }
  return c.umamiApiKey || process.env.UMAMI_API_KEY || ''
}

// Resolve the server-only config. Non-secret values are build-baked into the
// Nitro runtime config (see vite.config.ts); the API key is resolved at runtime
// (see resolveApiKey). Never runs in the browser.
async function getConfig(): Promise<UmamiConfig> {
  const c = useRuntimeConfig() as Record<string, string | undefined>
  return {
    apiKey: await resolveApiKey(c),
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
    const cfg = await getConfig()
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
    const cfg = await getConfig()
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
    const cfg = await getConfig()
    if (!isConfigured(cfg)) return emptyDetail(data.formId, data.range)
    try {
      return await fetchFormDetailData(cfg, data.formId, data.range)
    } catch {
      return emptyDetail(data.formId, data.range)
    }
  })
