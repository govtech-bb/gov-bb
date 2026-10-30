// k6 run: landing time to first byte with api_v2 (#3147) and for unknown
// URLs (#3149), against static landing on staging as the baseline.
//
//   k6 run apps/landing/perf/ttfb.mjs
//
// Both hosts run side by side from the same machine, so they share its
// network. Each gets a 30 s unmeasured warm-up, then 200 requests per URL at
// a steady 10 a second, round-robin over the URLs. TTFB is k6's
// `http_req_waiting`: request sent to first response byte, without DNS,
// connect or TLS (connections are reused). handleSummary writes
// `summary.md` (for the job summary) and `verdict.json` (`pass` false when a
// budget in budget.ts is exceeded) into OUT_DIR.
import http from 'k6/http'
import exec from 'k6/execution'
import { Counter, Trend } from 'k6/metrics'
import { evaluate, renderSummary } from './budget.ts'

const TARGETS = {
  preview:
    __ENV.PREVIEW_URL || 'https://v2-rewrite.d3kbl8o0ovutw4.amplifyapp.com',
  staging: __ENV.STAGING_URL || 'https://staging.alpha.gov.bb',
}
const OUT_DIR = __ENV.OUT_DIR || '.'

// At least one URL per template, all public on both hosts. Status is the one the URL
// must answer with; the redirect isn't followed, so its own TTFB is measured.
// A wrong status fails the run, so if a page here is unpublished or renamed
// on either host, swap it for another page of the same template.
const CONTENT = [
  ['/', 200], // home
  ['/services', 200], // services index
  ['/family-birth-relationships', 200], // category listing
  ['/money-financial-support', 200], // category listing
  ['/family-birth-relationships/register-a-birth', 200], // content page
  ['/family-birth-relationships/get-birth-certificate', 200], // content page with Start
  ['/family-birth-relationships/get-death-certificate/start', 200], // /start sub-page
  ['/money-financial-support/get-disaster-relief-assistance', 200], // content page
  ['/public-safety/report-a-concern-about-a-child', 200], // content page
  ['/travel-id-citizenship/get-a-document-notarised', 200], // content page
  ['/work-employment/apply-to-jobstart-plus-programme', 200], // content page
  ['/health-and-emergency-services/stormready/checklist', 200], // api_v2 miss, static fallback
  ['/terms-conditions', 200], // top-level info page
  ['/what-we-mean-by-alpha', 200], // top-level info page
  ['/money-financial-support/calculate-severance-pay', 200], // calculator
  ['/bank-holiday-calendar', 200], // dedicated route
  [
    '/health-and-emergency-services/find-an-open-pharmacy/winston-scott-polyclinic',
    200,
  ], // finder detail
  ['/health-and-emergency-services/find-an-emergency-shelter', 200], // finder
  ['/health-and-emergency-services/water-outages', 200], // dedicated route
  ['/register-a-birth', 301], // bare-slug redirect
]

// Unknown URLs shaped like the bot probes landing gets, plus a typo.
const UNKNOWN = [
  ['/wp-login.php', 404],
  ['/xmlrpc.php', 404],
  ['/.env', 404],
  ['/.git/config', 404],
  ['/admin/login', 404],
  ['/family-birth-relationships/register-a-brth', 404],
]

const URLS = [
  ...CONTENT.map(([path, status]) => ({ path, status, kind: 'content' })),
  ...UNKNOWN.map(([path, status]) => ({ path, status, kind: 'notFound' })),
]
const PER_URL = 200
const RATE = 10 // requests a second, per host
const WARMUP_S = 30
const MEASURED_S = Math.ceil((URLS.length * PER_URL) / RATE)

const ttfb = {}
const unexpected = {}
for (const target of Object.keys(TARGETS)) {
  ttfb[target] = {
    content: new Trend(`ttfb_content_${target}`, true),
    notFound: new Trend(`ttfb_404_${target}`, true),
  }
  unexpected[target] = new Counter(`unexpected_status_${target}`)
}

const scenario = (target, measured) => ({
  executor: 'constant-arrival-rate',
  exec: 'hit',
  rate: RATE,
  timeUnit: '1s',
  duration: `${measured ? MEASURED_S : WARMUP_S}s`,
  startTime: measured ? `${WARMUP_S}s` : '0s',
  preAllocatedVUs: 10,
  maxVUs: 40,
  env: { TARGET: target, MEASURED: measured ? '1' : '' },
})

export const options = {
  scenarios: {
    warmup_preview: scenario('preview', false),
    warmup_staging: scenario('staging', false),
    preview: scenario('preview', true),
    staging: scenario('staging', true),
  },
  summaryTrendStats: ['med', 'p(95)', 'max', 'count'],
  userAgent: 'govtech-bb-landing-perf/1.0 (k6; #3147)',
}

const reported = new Set()

export function hit() {
  const target = __ENV.TARGET
  const url = URLS[exec.scenario.iterationInTest % URLS.length]
  const res = http.get(`${TARGETS[target]}${url.path}`, {
    redirects: 0,
    tags: { name: url.path },
  })
  if (!__ENV.MEASURED) return
  ttfb[target][url.kind].add(res.timings.waiting)
  if (res.status !== url.status) {
    unexpected[target].add(1)
    // First mismatch per URL only (per VU), so the log stays readable; the
    // counter still counts every one.
    const key = `${target} ${url.path}`
    if (!reported.has(key)) {
      reported.add(key)
      console.error(`${key}: ${res.status}, expected ${url.status}`)
    }
  }
}

function result(data, target) {
  const pct = (name) => {
    const v = data.metrics[name]?.values ?? {}
    return { p50: v.med ?? NaN, p95: v['p(95)'] ?? NaN, count: v.count ?? 0 }
  }
  return {
    content: pct(`ttfb_content_${target}`),
    notFound: pct(`ttfb_404_${target}`),
    unexpected: data.metrics[`unexpected_status_${target}`]?.values.count ?? 0,
  }
}

export function handleSummary(data) {
  const preview = result(data, 'preview')
  const staging = result(data, 'staging')
  const rows = evaluate(preview, staging, {
    content: CONTENT.length * PER_URL,
    notFound: UNKNOWN.length * PER_URL,
  })
  const md = renderSummary(rows, [
    { name: 'api_v2', url: TARGETS.preview, result: preview },
    { name: 'static', url: TARGETS.staging, result: staging },
  ])
  return {
    stdout: md,
    [`${OUT_DIR}/summary.md`]: md,
    [`${OUT_DIR}/verdict.json`]: JSON.stringify({
      pass: rows.every((r) => r.pass),
      preview,
      staging,
      rows,
    }),
  }
}
