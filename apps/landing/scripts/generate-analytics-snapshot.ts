// Build-time generator for the /analytics page snapshot.
//
// The /analytics page renders STATIC data baked in at build time — it never
// calls Umami at request time (that fanned out to ~30 calls per view and made
// the page slow). This script does all the Umami work once, during the Amplify
// build, and writes a ReportModel JSON the route imports directly.
//
// It is wired into `apps/landing` build (see package.json). Refreshing the live
// data is a redeploy: the scheduled `refresh-analytics.yml` workflow triggers an
// Amplify RELEASE, which re-runs this generator with the app's UMAMI_* build
// env and reships the page with fresh numbers.
//
// Resilience: analytics must never break the landing deploy. With no Umami
// credentials (local dev, CI) or on any fetch error, we leave the committed
// placeholder snapshot in place and exit 0.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  UmamiClient,
  aggregateFormEvents,
  buildFormDetail,
  buildFormRows,
  buildPageRows,
  buildPresets,
  buildSearchReport,
  buildSources,
  type FormDetail,
  type FormDetailSource,
  type PresetReport,
  type ReportModel,
} from '@govtech-bb/umami-analytics'

const TOP_N = 10
const TOP_SOURCES = 3
const OUT = fileURLToPath(
  new URL('../src/content/analytics-snapshot.json', import.meta.url),
)

function readEnv() {
  const apiKey = process.env.UMAMI_API_KEY
  const landingWebsiteId = process.env.UMAMI_LANDING_WEBSITE_ID
  const formsWebsiteId = process.env.UMAMI_FORMS_WEBSITE_ID
  if (!apiKey || !landingWebsiteId || !formsWebsiteId) return null
  return {
    apiKey,
    landingWebsiteId,
    formsWebsiteId,
    apiUrl: process.env.UMAMI_API_URL || undefined,
    timezone: process.env.UMAMI_TIMEZONE || 'America/Barbados',
  }
}

async function buildPreset(
  client: UmamiClient,
  cfg: NonNullable<ReturnType<typeof readEnv>>,
  preset: {
    key: string
    label: string
    range: { startAt: number; endAt: number }
  },
): Promise<PresetReport> {
  // Pages + per-page top referrers.
  const pages = buildPageRows(
    await client.metricsUrls(cfg.landingWebsiteId, preset.range),
    TOP_N,
  )
  for (const page of pages) {
    page.topSources = buildSources(
      await client.metricsReferrers(
        cfg.landingWebsiteId,
        page.path,
        preset.range,
      ),
      TOP_SOURCES,
    )
  }

  // Forms: rank by starts, then pull drill-down detail only for the top N.
  const agg = aggregateFormEvents(
    await client.metricsEvents(cfg.formsWebsiteId, preset.range),
  )
  const topFormIds = [...agg.entries()]
    .sort(
      (a, b) =>
        (b[1].counts['form-start'] ?? 0) - (a[1].counts['form-start'] ?? 0),
    )
    .slice(0, TOP_N)
    .map(([formId]) => formId)

  const details = new Map<string, FormDetailSource>()
  const detailModels: Record<string, FormDetail> = {}
  for (const formId of topFormIds) {
    const ve = `${formId}:form-validation-error`
    const source: FormDetailSource = {
      duration: await client.eventDataValues(
        cfg.formsWebsiteId,
        `${formId}:form-submit`,
        'duration_seconds',
        preset.range,
      ),
      errorCount: await client.eventDataValues(
        cfg.formsWebsiteId,
        ve,
        'errorCount',
        preset.range,
      ),
      fields: await client.eventDataValues(
        cfg.formsWebsiteId,
        ve,
        'fields',
        preset.range,
      ),
      errorTypes: await client.eventDataValues(
        cfg.formsWebsiteId,
        ve,
        'errorTypes',
        preset.range,
      ),
    }
    details.set(formId, source)
    detailModels[formId] = buildFormDetail(formId, agg.get(formId)!, source)
  }

  // Empty meta: the page enriches title/category from its content registry
  // (which is vite-compiled and can't be imported here).
  const forms = buildFormRows(agg, new Map(), details, TOP_N)

  const search = buildSearchReport(
    await client.eventDataValues(
      cfg.landingWebsiteId,
      'search',
      'query',
      preset.range,
    ),
    await client.eventDataValues(
      cfg.landingWebsiteId,
      'search',
      'results',
      preset.range,
    ),
    await client.eventDataValues(
      cfg.landingWebsiteId,
      'search-submit',
      'query',
      preset.range,
    ),
    await client.eventDataValues(
      cfg.landingWebsiteId,
      'search-submit',
      'source',
      preset.range,
    ),
    TOP_N,
  )

  return {
    key: preset.key,
    label: preset.label,
    pages,
    forms,
    details: detailModels,
    search,
  }
}

async function main() {
  const cfg = readEnv()
  if (!cfg) {
    console.warn(
      '[analytics-snapshot] UMAMI_* not configured — leaving the committed placeholder snapshot in place.',
    )
    return
  }

  const client = new UmamiClient({ apiKey: cfg.apiKey, baseUrl: cfg.apiUrl })
  const presets = buildPresets(cfg.timezone, new Date())
  const reports: PresetReport[] = []
  for (const preset of presets) {
    try {
      reports.push(await buildPreset(client, cfg, preset))
      console.log(`[analytics-snapshot] built preset "${preset.key}"`)
    } catch (err) {
      console.warn(
        `[analytics-snapshot] preset "${preset.key}" failed, skipping:`,
        err,
      )
    }
  }

  if (reports.length === 0) {
    console.warn(
      '[analytics-snapshot] no presets built — leaving the committed placeholder snapshot in place.',
    )
    return
  }

  const model: ReportModel = {
    generatedAt: new Date().toISOString(),
    timezone: cfg.timezone,
    presets: reports,
  }
  writeFileSync(OUT, JSON.stringify(model))
  console.log(`[analytics-snapshot] wrote ${reports.length} presets → ${OUT}`)
}

main().catch((err) => {
  // Never fail the landing build because analytics couldn't be generated.
  console.warn(
    '[analytics-snapshot] generation failed, leaving existing snapshot:',
    err,
  )
})
