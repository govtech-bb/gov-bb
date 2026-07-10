// Data source for the /analytics page. The report is fetched server-side from
// the API's cached endpoint (GET /analytics/report), which the API refreshes
// every 15 minutes from Umami. Crawling Umami stays off the request path and
// the API key stays server-side — this page just reads the served cache.
import { createServerFn } from '@tanstack/react-start'
import { useRuntimeConfig } from 'nitro/runtime-config'
import type { ReportModel } from '@govtech-bb/umami-analytics'

// Per-environment API base, injected via VITE_API_URL and snapshotted into the
// Nitro runtime config at build time (see vite.config.ts) — the Amplify SSR
// Lambda never sees Console env vars at runtime, so a raw process.env read is
// undefined in prod. Matches the pattern landing uses for its forms API base.
const DEFAULT_API_URL = 'https://forms.api.sandbox.alpha.gov.bb'

export interface ReportPayload {
  /** false during cold start, before the first scheduled refresh populates. */
  ready: boolean
  /** ISO timestamp the cache row was last written, or null on cold start. */
  refreshedAt: string | null
  report: ReportModel | null
}

const WARMING_UP: ReportPayload = {
  ready: false,
  refreshedAt: null,
  report: null,
}

/**
 * Fetch the cached report from the API. Runs on the server (SSR + server-fn
 * RPC) so the browser never talks to the API directly. A network error or
 * non-2xx degrades to the warming-up state rather than throwing, so the page
 * always renders.
 */
export const fetchReport = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ReportPayload> => {
    const config = useRuntimeConfig() as { apiUrl?: string }
    const apiBase = (
      config.apiUrl ||
      process.env.VITE_API_URL ||
      DEFAULT_API_URL
    ).replace(/\/+$/, '')
    try {
      const res = await fetch(`${apiBase}/analytics/report`)
      if (!res.ok) return WARMING_UP
      return (await res.json()) as ReportPayload
    } catch {
      return WARMING_UP
    }
  },
)
