import { createServerFn } from '@tanstack/react-start'
import { useRuntimeConfig } from 'nitro/runtime-config'
import {
  UmamiClient,
  aggregateFormEvents,
  buildFormDetail,
  buildFunnel,
  buildPageRows,
  buildPresets,
  buildSearchReport,
  buildSources,
  weightedAverage,
  weightedSum,
  type FormDetail,
  type PageRow,
  type Range,
  type SearchReport,
} from '@govtech-bb/umami-analytics'
import { PAGES } from '../content/registry'

// Server-side Umami report for the /analytics page. The API key never reaches
// the browser (read here via runtimeConfig); the page receives only the
// aggregated model. Results are cached per request shape to keep loads fast and
// stay well under Umami's rate limit despite the route being public.

const TOP_N = 10
const SUMMARY_TTL_MS = 5 * 60_000
const DETAIL_TTL_MS = 5 * 60_000

interface UmamiConfig {
  apiKey?: string
  landingWebsiteId?: string
  formsWebsiteId?: string
  apiUrl?: string
  timezone?: string
}

function readConfig(): {
  apiKey: string
  landingWebsiteId: string
  formsWebsiteId: string
  apiUrl?: string
  timezone: string
} {
  const c = useRuntimeConfig() as { umami?: UmamiConfig }
  const u = c.umami ?? {}
  const apiKey = u.apiKey || process.env.UMAMI_API_KEY
  const landingWebsiteId =
    u.landingWebsiteId || process.env.UMAMI_LANDING_WEBSITE_ID
  const formsWebsiteId = u.formsWebsiteId || process.env.UMAMI_FORMS_WEBSITE_ID
  if (!apiKey || !landingWebsiteId || !formsWebsiteId) {
    throw new Error(
      'Umami analytics is not configured (UMAMI_API_KEY + website ids)',
    )
  }
  return {
    apiKey,
    landingWebsiteId,
    formsWebsiteId,
    apiUrl: u.apiUrl || process.env.UMAMI_API_URL || undefined,
    timezone: u.timezone || process.env.UMAMI_TIMEZONE || 'America/Barbados',
  }
}

// form_id -> { title, category } from landing's own content registry.
const FORM_META = new Map<string, { title: string; category: string }>()
for (const page of PAGES) {
  const id = page.frontmatter.form_id
  if (!id || FORM_META.has(id)) continue
  FORM_META.set(id, {
    title: page.frontmatter.title,
    category: page.frontmatter.categories[0] ?? 'uncategorised',
  })
}

export interface PresetOption {
  key: string
  label: string
}
export interface FormSummary {
  formId: string
  title: string
  category: string
  starts: number
  completes: number
  completionPct: number
}
export interface AnalyticsView {
  generatedAt: string
  timezone: string
  presetKey: string
  presets: PresetOption[]
  pages: PageRow[]
  forms: FormSummary[]
  search: SearchReport
}
export interface FormDetailView {
  detail: FormDetail
  avgFieldErrors: number
  avgDurationSeconds: number | null
  totalFieldErrors: number
}

interface Cached<T> {
  value: T
  fetchedAt: number
}
const summaryCache = new Map<string, Cached<AnalyticsView>>()
const detailCache = new Map<string, Cached<FormDetailView>>()

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function resolvePreset(
  presetKey: string,
  timezone: string,
): { range: Range; presets: PresetOption[]; key: string } {
  const presets = buildPresets(timezone, new Date())
  const match =
    presets.find((p) => p.key === presetKey) ??
    presets.find((p) => p.key === 'last-30-days') ??
    presets[0]
  return {
    range: match.range,
    key: match.key,
    presets: presets.map((p) => ({ key: p.key, label: p.label })),
  }
}

export const getAnalytics = createServerFn()
  .validator((presetKey: string) => presetKey)
  .handler(async ({ data: presetKey }): Promise<AnalyticsView> => {
    const cfg = readConfig()
    const { range, key, presets } = resolvePreset(presetKey, cfg.timezone)

    const cached = summaryCache.get(key)
    if (cached && Date.now() - cached.fetchedAt < SUMMARY_TTL_MS)
      return cached.value

    const client = new UmamiClient({ apiKey: cfg.apiKey, baseUrl: cfg.apiUrl })

    // Pages + per-page top referrers.
    const pages = buildPageRows(
      await client.metricsUrls(cfg.landingWebsiteId, range),
      TOP_N,
    )
    for (const page of pages) {
      const refs = await client.metricsReferrers(
        cfg.landingWebsiteId,
        page.path,
        range,
      )
      page.topSources = buildSources(refs, 3)
    }

    // Form summary (starts/completion) — drill-down detail is fetched lazily.
    const agg = aggregateFormEvents(
      await client.metricsEvents(cfg.formsWebsiteId, range),
    )
    const forms: FormSummary[] = [...agg.entries()]
      .map(([formId, entry]) => {
        const starts = entry.counts['form-start'] ?? 0
        const completes = entry.counts['form-submit'] ?? 0
        const meta = FORM_META.get(formId)
        return {
          formId,
          title: meta?.title ?? formId,
          category: meta?.category ?? 'uncategorised',
          starts,
          completes,
          completionPct:
            starts === 0 ? 0 : round((completes / starts) * 100, 1),
        }
      })
      .sort((a, b) => b.starts - a.starts)
      .slice(0, TOP_N)

    // Search: search-submit (always populated) + search (results page).
    const search = buildSearchReport(
      await client.eventDataValues(
        cfg.landingWebsiteId,
        'search',
        'query',
        range,
      ),
      await client.eventDataValues(
        cfg.landingWebsiteId,
        'search',
        'results',
        range,
      ),
      await client.eventDataValues(
        cfg.landingWebsiteId,
        'search-submit',
        'query',
        range,
      ),
      await client.eventDataValues(
        cfg.landingWebsiteId,
        'search-submit',
        'source',
        range,
      ),
      TOP_N,
    )

    const view: AnalyticsView = {
      generatedAt: new Date().toISOString(),
      timezone: cfg.timezone,
      presetKey: key,
      presets,
      pages,
      forms,
      search,
    }
    summaryCache.set(key, { value: view, fetchedAt: Date.now() })
    return view
  })

export const getFormDetail = createServerFn()
  .validator((input: { presetKey: string; formId: string }) => input)
  .handler(async ({ data: { presetKey, formId } }): Promise<FormDetailView> => {
    const cfg = readConfig()
    const { range, key } = resolvePreset(presetKey, cfg.timezone)
    const cacheKey = `${key}::${formId}`

    const cached = detailCache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < DETAIL_TTL_MS)
      return cached.value

    const client = new UmamiClient({ apiKey: cfg.apiKey, baseUrl: cfg.apiUrl })
    const ve = `${formId}:form-validation-error`
    const agg = aggregateFormEvents(
      await client.metricsEvents(cfg.formsWebsiteId, range),
    )
    const entry = agg.get(formId) ?? { counts: {}, steps: [] }
    const duration = await client.eventDataValues(
      cfg.formsWebsiteId,
      `${formId}:form-submit`,
      'duration_seconds',
      range,
    )
    const errorCount = await client.eventDataValues(
      cfg.formsWebsiteId,
      ve,
      'errorCount',
      range,
    )
    const fields = await client.eventDataValues(
      cfg.formsWebsiteId,
      ve,
      'fields',
      range,
    )
    const errorTypes = await client.eventDataValues(
      cfg.formsWebsiteId,
      ve,
      'errorTypes',
      range,
    )

    const starts = entry.counts['form-start'] ?? 0
    const totalFieldErrors = weightedSum(errorCount)
    const avgDuration = weightedAverage(duration)
    const view: FormDetailView = {
      detail: {
        ...buildFormDetail(formId, entry, {
          duration,
          errorCount,
          fields,
          errorTypes,
        }),
        funnel: buildFunnel(entry),
      },
      avgFieldErrors: starts === 0 ? 0 : round(totalFieldErrors / starts, 2),
      avgDurationSeconds: avgDuration === null ? null : Math.round(avgDuration),
      totalFieldErrors,
    }
    detailCache.set(cacheKey, { value: view, fetchedAt: Date.now() })
    return view
  })
