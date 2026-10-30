/**
 * Crawl landing served from api_v2 and compare every sitemap page with the
 * same path on the static baseline (#3141). Exits 1 on any difference that
 * isn't in allowlist.json; every difference, allowed or not, goes into the
 * report (and the GitHub job summary when GITHUB_STEP_SUMMARY is set).
 *
 *   pnpm --filter @govtech-bb/landing parity:crawl
 *
 * V2_BASE_URL and STATIC_BASE_URL override the two hosts.
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { comparePages, snapshot } from './compare.ts'
import type { PageSnapshot } from './compare.ts'

const V2 =
  process.env.V2_BASE_URL ?? 'https://v2-rewrite.d3kbl8o0ovutw4.amplifyapp.com'
const STATIC = process.env.STATIC_BASE_URL ?? 'https://staging.alpha.gov.bb'
const CONCURRENCY = 6

interface AllowEntry {
  path: string
  reason: string
}
const allowlist: AllowEntry[] = JSON.parse(
  readFileSync(new URL('./allowlist.json', import.meta.url), 'utf8'),
)

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
      return {
        snap: snapshot(res.status, res.headers.get('location'), html, url),
        source: res.headers.get('x-content-source'),
      }
    } catch (err) {
      if (attempt === 3) throw new Error(`${url}: ${String(err)}`)
    }
  }
}

async function sitemapPaths(): Promise<string[]> {
  const res = await fetch(`${V2}/sitemap.xml`)
  if (!res.ok) throw new Error(`${V2}/sitemap.xml answered ${res.status}`)
  const xml = await res.text()
  const paths = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(
    (m) => new URL(m[1]).pathname,
  )
  if (paths.length === 0) throw new Error('sitemap lists no URLs')
  return [...new Set(paths)]
}

interface Result {
  path: string
  source: string | null
  diffs: string[]
}

async function main() {
  const paths = await sitemapPaths()
  const results: Result[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < paths.length) {
        const path = paths[next++]
        const [v2, base] = await Promise.all([
          fetchPage(V2, path),
          fetchPage(STATIC, path),
        ])
        results.push({
          path,
          source: v2.source,
          diffs: comparePages(v2.snap, base.snap),
        })
      }
    }),
  )
  results.sort((a, b) => a.path.localeCompare(b.path))

  const allowed = new Map(allowlist.map((e) => [e.path, e.reason]))
  const differing = results.filter((r) => r.diffs.length > 0)
  const failing = differing.filter((r) => !allowed.has(r.path))
  const stale = allowlist.filter(
    (e) => !differing.some((r) => r.path === e.path),
  )
  const sources = new Map<string, number>()
  for (const r of results) {
    const key = r.source ?? '(none)'
    sources.set(key, (sources.get(key) ?? 0) + 1)
  }

  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const lines = [
    '## Landing api_v2 parity crawl',
    '',
    `${results.length} sitemap URLs on ${V2} compared with ${STATIC}.`,
    `**${failing.length} failing**, ${differing.length - failing.length} allowlisted, ${results.length - differing.length} matching.`,
    '',
    `x-content-source: ${[...sources].map(([k, v]) => `${k} ${v}`).join(', ')}`,
    '',
  ]
  if (differing.length > 0) {
    lines.push('| Path | Status | Differences |', '| --- | --- | --- |')
    for (const r of differing) {
      const reason = allowed.get(r.path)
      lines.push(
        `| \`${r.path}\` | ${reason ? `allowed: ${cell(reason)}` : '**fail**'} | ${r.diffs.map(cell).join('<br>')} |`,
      )
    }
    lines.push('')
  }
  if (stale.length > 0) {
    lines.push(
      'Allowlist entries that no longer differ (remove them):',
      ...stale.map((e) => `- \`${e.path}\``),
      '',
    )
  }
  const report = lines.join('\n')
  console.log(report)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  if (failing.length > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
