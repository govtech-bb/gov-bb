/**
 * Time-to-first-byte budgets for landing served from api_v2 (#3147, #3149),
 * compared with static landing on staging while staging is static (until
 * #3227). Pure, so it runs in both k6
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

/** Requests each host must complete: k6 drops iterations without error when
 * every VU is busy, which under-samples exactly the slow stretches. */
export interface Expected {
  content: number
  notFound: number
}

/** Without `staging`, the "vs staging" budgets are left out. */
export function evaluate(
  preview: HostResult,
  staging: HostResult | undefined,
  expected: Expected,
): BudgetRow[] {
  const b = BUDGETS
  const hosts = staging ? [preview, staging] : [preview]
  const fixed: BudgetRow[] = [
    {
      budget: 'Content p95 (#3147)',
      actual: ms(preview.content.p95),
      limit: `< ${ms(b.contentP95Ms)}`,
      pass: preview.content.p95 < b.contentP95Ms,
    },
    {
      budget: '404 p95 (#3149)',
      actual: ms(preview.notFound.p95),
      limit: `< ${ms(b.notFoundP95Ms)}`,
      pass: preview.notFound.p95 < b.notFoundP95Ms,
    },
    {
      // A fast 5xx would pass every latency budget, so a wrong status on
      // any host voids the run.
      budget: 'Unexpected statuses (every host)',
      actual: String(hosts.reduce((n, h) => n + h.unexpected, 0)),
      limit: '0',
      pass: hosts.every((h) => h.unexpected === 0),
    },
    {
      budget: 'Full sample (every host)',
      actual: hosts
        .map((h) => `${h.content.count} + ${h.notFound.count}`)
        .join(', '),
      limit: `>= ${expected.content} + ${expected.notFound} each`,
      pass: hosts.every(
        (h) =>
          h.content.count >= expected.content &&
          h.notFound.count >= expected.notFound,
      ),
    },
  ]
  if (!staging) return fixed
  const p95Limit = staging.content.p95 * b.contentP95VsStaging
  const p50Limit = staging.content.p50 + b.contentP50OverStagingMs
  const nfLimit = staging.notFound.p95 + b.notFoundP95OverStagingMs
  return [
    ...fixed,
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
      budget: '404 p95 vs staging (#3149)',
      actual: ms(preview.notFound.p95),
      limit: `<= ${ms(nfLimit)} (staging +150 ms)`,
      pass: preview.notFound.p95 <= nfLimit,
    },
  ]
}

export function renderSummary(
  rows: BudgetRow[],
  hosts: { name: string; url: string; result: HostResult }[],
): string {
  const lines = [
    '### Landing time to first byte from api_v2 (#3147, #3149)',
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
