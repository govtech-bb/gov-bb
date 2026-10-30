/**
 * Time-to-first-byte budgets for landing served from api_v2 (#3147, #3149),
 * compared with static landing on staging. Pure, so it runs in both k6
 * (`ttfb.mjs` imports it) and vitest.
 */

/** p50 and p95 TTFB in ms, and how many requests they cover. */
export interface Percentiles {
  p50: number
  p95: number
  count: number
}

/** One host's measured run: content pages and unknown URLs kept apart. */
export interface HostResult {
  content: Percentiles
  notFound: Percentiles
  /** Requests whose status wasn't the one the URL is pinned to. */
  unexpected: number
}

export interface BudgetRow {
  budget: string
  actual: string
  limit: string
  pass: boolean
}

/** Set 25 Oct 2026; review after the first 5 runs. */
export const BUDGETS = {
  contentP95Ms: 800,
  contentP95VsStaging: 1.2,
  contentP50OverStagingMs: 100,
  notFoundP95Ms: 500,
  notFoundP95OverStagingMs: 150,
} as const

const ms = (n: number) => `${Math.round(n)} ms`

export function evaluate(
  preview: HostResult,
  staging: HostResult,
): BudgetRow[] {
  const b = BUDGETS
  const p95Limit = staging.content.p95 * b.contentP95VsStaging
  const p50Limit = staging.content.p50 + b.contentP50OverStagingMs
  const nfLimit = staging.notFound.p95 + b.notFoundP95OverStagingMs
  return [
    {
      budget: 'Content p95 (#3147)',
      actual: ms(preview.content.p95),
      limit: `< ${ms(b.contentP95Ms)}`,
      pass: preview.content.p95 < b.contentP95Ms,
    },
    {
      budget: 'Content p95 vs staging (#3147)',
      actual: ms(preview.content.p95),
      limit: `<= ${ms(p95Limit)} (staging +20%)`,
      pass: preview.content.p95 <= p95Limit,
    },
    {
      budget: 'Content p50 vs staging (#3147)',
      actual: ms(preview.content.p50),
      limit: `<= ${ms(p50Limit)} (staging +100 ms)`,
      pass: preview.content.p50 <= p50Limit,
    },
    {
      budget: '404 p95 (#3149)',
      actual: ms(preview.notFound.p95),
      limit: `< ${ms(b.notFoundP95Ms)}`,
      pass: preview.notFound.p95 < b.notFoundP95Ms,
    },
    {
      budget: '404 p95 vs staging (#3149)',
      actual: ms(preview.notFound.p95),
      limit: `<= ${ms(nfLimit)} (staging +150 ms)`,
      pass: preview.notFound.p95 <= nfLimit,
    },
    {
      // A fast 5xx would pass every latency budget, so a wrong status on
      // either host voids the run.
      budget: 'Unexpected statuses (both hosts)',
      actual: String(preview.unexpected + staging.unexpected),
      limit: '0',
      pass: preview.unexpected + staging.unexpected === 0,
    },
  ]
}

export function renderSummary(
  rows: BudgetRow[],
  hosts: { name: string; url: string; result: HostResult }[],
): string {
  const lines = [
    '### Landing time to first byte: api_v2 vs static (#3147, #3149)',
    '',
    '| Host | Pages | Requests | p50 | p95 |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const { name, url, result } of hosts) {
    for (const [label, p] of [
      ['content', result.content],
      ['404', result.notFound],
    ] as const) {
      lines.push(
        `| ${name} (${url}) | ${label} | ${p.count} | ${ms(p.p50)} | ${ms(p.p95)} |`,
      )
    }
  }
  lines.push(
    '',
    '| Budget | Actual | Limit | Result |',
    '| --- | --- | --- | --- |',
  )
  for (const r of rows) {
    lines.push(
      `| ${r.budget} | ${r.actual} | ${r.limit} | ${r.pass ? 'pass' : '**FAIL**'} |`,
    )
  }
  return lines.join('\n') + '\n'
}
