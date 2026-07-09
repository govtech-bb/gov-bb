// Generator for the committed /analytics snapshot.
//
// The /analytics page renders STATIC data from a JSON that is COMMITTED to the
// repo (src/content/analytics-snapshot.json) and bundled at build time — it
// never calls Umami at request time (that fanned out to ~30 calls per view and
// made the page slow), and the build does no fetching either, so deploys need
// no UMAMI_* env vars and previews are stable.
//
// To refresh the data: run `pnpm run generate:analytics` (it auto-loads the
// repo-root .env for UMAMI_* creds), then COMMIT the updated snapshot JSON.
//
// Resilience: if the creds are absent or any fetch fails, the existing
// committed snapshot is left untouched and the script exits 0 — running it
// without creds can never blank out the committed data.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  UmamiClient,
  aggregateFormEvents,
  aggregateSessions,
  buildFormDetail,
  buildFormRows,
  buildJourneys,
  buildPageRows,
  buildPresets,
  buildSearchReport,
  buildSources,
  type ActivityRow,
  type FormDetail,
  type FormDetailSource,
  type PresetReport,
  type RawSession,
  type ReportModel,
  type SessionReport,
} from '@govtech-bb/umami-analytics'
import { loadContent } from '@govtech-bb/content'
import type { FormMeta } from '@govtech-bb/umami-analytics'

const TOP_N = 10
const TOP_SOURCES = 3
const OUT = fileURLToPath(
  new URL('../src/content/analytics-snapshot.json', import.meta.url),
)

// Local convenience: load the repo-root .env so `pnpm run generate:analytics`
// works without manually exporting UMAMI_*. Skipped when the vars are already
// in the environment (Amplify build) or no .env exists (CI).
function loadLocalEnv() {
  if (process.env.UMAMI_API_KEY) return
  const envFile = fileURLToPath(new URL('../../../.env', import.meta.url))
  if (existsSync(envFile)) process.loadEnvFile(envFile)
}

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
  meta: Map<string, FormMeta>,
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

  const forms = buildFormRows(agg, meta, details, TOP_N)

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

// Session-based consolidated report: crawl recent sessions + their activity and
// aggregate distinct-session funnels, flow, entry/exit, device/country. Bounded
// by UMAMI_SESSION_DAYS (default 7) and UMAMI_SESSION_MAX (default 500) to stay
// within Umami's rate limit; the client throttles + retries transient errors.
//
// RESUMABLE: each session's activity is cached to disk as it's fetched
// (.session-cache.json, gitignored). A re-run reuses the cache and only fetches
// sessions not yet cached — so a crawl interrupted by a network drop picks up
// where it stopped instead of re-crawling from scratch. Returns null only if
// nothing at all could be gathered.
const CACHE = fileURLToPath(new URL('./.session-cache.json', import.meta.url))

interface SessionCache {
  key: string
  activities: Record<string, ActivityRow[]>
}

function loadCache(key: string): SessionCache {
  if (existsSync(CACHE)) {
    try {
      const c = JSON.parse(readFileSync(CACHE, 'utf8')) as SessionCache
      if (c.key === key) return c
    } catch {
      /* corrupt/stale cache — start fresh */
    }
  }
  return { key, activities: {} }
}

async function buildSessionReport(
  client: UmamiClient,
  websiteId: string,
  now: Date,
): Promise<SessionReport | null> {
  const days = Number(process.env.UMAMI_SESSION_DAYS ?? 7)
  const maxSessions = Number(process.env.UMAMI_SESSION_MAX ?? 500)
  const endAt = now.getTime()
  const startAt = endAt - days * 86_400_000
  const key = `${websiteId}:${days}d:${new Date(endAt).toISOString().slice(0, 10)}`

  let sessions: RawSession[]
  try {
    sessions = await client.listSessions(
      websiteId,
      { startAt, endAt },
      maxSessions,
    )
  } catch (err) {
    console.warn('[analytics-snapshot] session list failed, skipping:', err)
    return null
  }

  const cache = loadCache(key)
  const cachedAtStart = Object.keys(cache.activities).length
  let fetched = 0
  let failed = 0
  const flush = () => writeFileSync(CACHE, JSON.stringify(cache))

  for (const s of sessions) {
    if (cache.activities[s.id]) continue // resume: already have it
    try {
      cache.activities[s.id] = await client.sessionActivity(websiteId, s.id, {
        startAt,
        endAt,
      })
      fetched++
      if (fetched % 25 === 0) flush() // periodic checkpoint so progress survives
    } catch {
      failed++ // skip this session; a re-run will retry it (not cached)
    }
  }
  flush()

  const withActivity = sessions
    .filter((s) => cache.activities[s.id])
    .map((s) => ({ session: s, activity: cache.activities[s.id]! }))

  if (!withActivity.length) {
    console.warn('[analytics-snapshot] no session activity gathered, skipping.')
    return null
  }
  console.log(
    `[analytics-snapshot] sessions: ${withActivity.length}/${sessions.length} with activity ` +
      `(${cachedAtStart} cached, ${fetched} fetched, ${failed} failed this run)`,
  )
  const report = aggregateSessions(buildJourneys(withActivity), {
    startAt,
    endAt,
  })
  console.log(
    `[analytics-snapshot] session report: ${report.totals.sessions} sessions, ${report.funnels.length} form funnels`,
  )
  return report
}

async function main() {
  loadLocalEnv()
  const cfg = readEnv()
  if (!cfg) {
    console.warn(
      '[analytics-snapshot] UMAMI_* not configured — leaving the committed placeholder snapshot in place.',
    )
    return
  }

  const client = new UmamiClient({ apiKey: cfg.apiKey, baseUrl: cfg.apiUrl })

  // Resolve form_id -> { title, category } from the shared content package so
  // the snapshot is self-describing (the page does no enrichment). Reads the
  // landing content dir (LANDING_CONTENT_DIR, else apps/landing/src/content).
  const { services } = await loadContent({})
  const meta = new Map<string, FormMeta>()
  for (const s of services) {
    if (!s.form_id || meta.has(s.form_id)) continue
    meta.set(s.form_id, {
      title: s.title,
      category: s.categories?.[0] ?? 'uncategorised',
    })
  }

  const presets = buildPresets(cfg.timezone, new Date())
  const reports: PresetReport[] = []
  for (const preset of presets) {
    try {
      reports.push(await buildPreset(client, cfg, meta, preset))
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

  // Consolidated session report (distinct-session funnels + journeys). One
  // website now carries both landing + forms events, so crawl either id.
  const sessions = await buildSessionReport(
    client,
    cfg.formsWebsiteId,
    new Date(),
  )

  const model: ReportModel = {
    generatedAt: new Date().toISOString(),
    timezone: cfg.timezone,
    presets: reports,
    ...(sessions ? { sessions } : {}),
  }
  writeFileSync(OUT, JSON.stringify(model))
  console.log(
    `[analytics-snapshot] wrote ${reports.length} presets${sessions ? ' + session report' : ''} → ${OUT}`,
  )
}

main().catch((err) => {
  // Manual generator: on any unexpected failure, log and leave the committed
  // snapshot untouched — never blank it out.
  console.warn(
    '[analytics-snapshot] generation failed, leaving existing snapshot:',
    err,
  )
})
