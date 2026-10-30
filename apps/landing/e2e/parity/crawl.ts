/**
 * Crawl landing served from api_v2 and compare every sitemap page with the
 * same path on the static baseline (#3141). Exits 1 on any difference that
 * allowlist.json doesn't list for that path; every difference, allowed or
 * not, goes into the report (and the GitHub job summary when
 * GITHUB_STEP_SUMMARY is set).
 *
 *   pnpm --filter @govtech-bb/landing parity:crawl
 *
 * V2_BASE_URL and STATIC_BASE_URL override the two hosts.
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { comparePages, snapshot, unallowedDiffs } from './compare.ts'
import type { AllowEntry, PageSnapshot } from './compare.ts'

const V2 =
  process.env.V2_BASE_URL ?? 'https://v2-rewrite.d3kbl8o0ovutw4.amplifyapp.com'
const STATIC = process.env.STATIC_BASE_URL ?? 'https://staging.alpha.gov.bb'
const CONCURRENCY = 6
const ATTEMPTS = 3

/** Sources meaning api_v2 failed and landing fell back (api-v2-page.ts). */
const FALLBACK_SOURCES = new Set(['api_v2-stale', 'static-fallback'])

const allowlist: AllowEntry[] = JSON.parse(
  readFileSync(new URL('./allowlist.json', import.meta.url), 'utf8'),
)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Fetch with retries on network errors and 5xx, with a short backoff. */
async function fetchPage(
  base: string,
  path: string,
): Promise<{ snap: PageSnapshot; source: string | null }> {
  const url = base + path
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      })
      const html = await res.text()
      if (res.status < 500 || attempt === ATTEMPTS)
        return {
          snap: snapshot(res.status, res.headers.get('location'), html, url),
          source: res.headers.get('x-content-source'),
        }
    } catch (err) {
      if (attempt === ATTEMPTS) throw new Error(`${url}: ${String(err)}`)
    }
    await sleep(2_000 * attempt)
  }
}

async function sitemapPaths(base: string): Promise<string[]> {
  const res = await fetch(`${base}/sitemap.xml`)
  if (!res.ok) throw new Error(`${base}/sitemap.xml answered ${res.status}`)
  const xml = await res.text()
  const paths = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(
    (m) => new URL(m[1]).pathname,
  )
  if (paths.length === 0) throw new Error(`${base}/sitemap.xml lists no URLs`)
  return paths
}

interface Result {
  path: string
  source: string | null
  diffs: string[]
}

async function comparePath(path: string): Promise<Result> {
  try {
    const [v2, base] = await Promise.all([
      fetchPage(V2, path),
      fetchPage(STATIC, path),
    ])
    const diffs = comparePages(v2.snap, base.snap)
    // A fallback page is static markdown, so it would compare equal
    // without testing api_v2 at all.
    if (v2.source && FALLBACK_SOURCES.has(v2.source))
      diffs.unshift(`served from ${v2.source}: api_v2 failed`)
    return { path, source: v2.source, diffs }
  } catch (err) {
    return { path, source: null, diffs: [`fetch failed: ${String(err)}`] }
  }
}

async function main() {
  // Both sitemaps, so a page missing from one side is still fetched.
  const [v2Paths, staticPaths] = await Promise.all([
    sitemapPaths(V2),
    sitemapPaths(STATIC),
  ])
  const paths = [...new Set([...v2Paths, ...staticPaths])]
  const results: Result[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < paths.length) results.push(await comparePath(paths[next++]))
    }),
  )
  results.sort((a, b) => a.path.localeCompare(b.path))

  const entries = new Map(allowlist.map((e) => [e.path, e]))
  const differing = results.filter((r) => r.diffs.length > 0)
  const failing = differing.filter(
    (r) => unallowedDiffs(r.diffs, entries.get(r.path)).length > 0,
  )
  const stale = allowlist.filter((e) =>
    e.diffs.some(
      (d) => !results.find((r) => r.path === e.path)?.diffs.includes(d),
    ),
  )
  const sources = new Map<string, number>()
  for (const r of results) {
    const key = r.source ?? '(none)'
    sources.set(key, (sources.get(key) ?? 0) + 1)
  }
  const servedByApiV2 = sources.get('api_v2') ?? 0

  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const lines = [
    '## Landing api_v2 parity crawl',
    '',
    `${results.length} sitemap URLs (${v2Paths.length} on ${V2}, ${staticPaths.length} on ${STATIC}) compared.`,
    `**${failing.length} failing**, ${differing.length - failing.length} allowlisted, ${results.length - differing.length} matching.`,
    '',
    `x-content-source on ${V2}: ${[...sources].map(([k, v]) => `${k} ${v}`).join(', ')}`,
    '',
  ]
  if (servedByApiV2 === 0)
    lines.push('**No page was served by api_v2**, so nothing was tested.', '')
  if (differing.length > 0) {
    lines.push('| Path | Status | Differences |', '| --- | --- | --- |')
    for (const r of differing) {
      const entry = entries.get(r.path)
      const fails = unallowedDiffs(r.diffs, entry)
      const status =
        fails.length > 0 ? '**fail**' : `allowed: ${cell(entry?.reason ?? '')}`
      const shown = r.diffs.map((d) =>
        fails.includes(d) ? `**${cell(d)}**` : cell(d),
      )
      lines.push(`| \`${r.path}\` | ${status} | ${shown.join('<br>')} |`)
    }
    lines.push('')
  }
  if (stale.length > 0) {
    lines.push(
      'Allowlist entries listing a difference that no longer occurs (update them):',
      ...stale.map((e) => `- \`${e.path}\``),
      '',
    )
  }
  const report = lines.join('\n')
  console.log(report)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  if (failing.length > 0 || servedByApiV2 === 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
