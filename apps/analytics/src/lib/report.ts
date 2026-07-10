// Server functions for the /analytics page. These run on the server (SSR +
// server-fn RPC), read Umami in real time, and return aggregate-only data — the
// browser never talks to Umami and never sees the API key. No DB, no snapshot:
// the overview loads with the page, each form's detail loads on click.
import { createServerFn } from '@tanstack/react-start'
import { useRuntimeConfig } from 'nitro/runtime-config'
import {
  fetchOverviewData,
  fetchFormDetailData,
  isConfigured,
  type UmamiConfig,
  type OverviewData,
  type FormDetailData,
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

const EMPTY_OVERVIEW: OverviewPayload = {
  configured: false,
  stats: { visitors: 0, pageviews: 0 },
  pages: [],
  forms: [],
}

const EMPTY_DETAIL: FormDetailData = {
  funnel: [],
  journey: [],
  submitErrorRate: null,
}

/**
 * Site overview + form list. Runs server-side on the initial SSR load. Degrades
 * to an unconfigured/empty payload (never throws) so the page always renders.
 */
export const fetchOverview = createServerFn({ method: 'GET' }).handler(
  async (): Promise<OverviewPayload> => {
    const cfg = getConfig()
    if (!isConfigured(cfg)) return EMPTY_OVERVIEW
    try {
      const data = await fetchOverviewData(cfg)
      return { configured: true, ...data }
    } catch {
      return EMPTY_OVERVIEW
    }
  },
)

/**
 * One form's funnel + journey + submit-error rate, fetched when the user opens
 * the form. Degrades to empty data on error rather than throwing.
 */
export const fetchFormDetail = createServerFn({ method: 'GET' })
  .validator((raw: unknown) => String(raw))
  .handler(async ({ data: formId }): Promise<FormDetailData> => {
    const cfg = getConfig()
    if (!isConfigured(cfg)) return EMPTY_DETAIL
    try {
      return await fetchFormDetailData(cfg, formId)
    } catch {
      return EMPTY_DETAIL
    }
  })
