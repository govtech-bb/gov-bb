/**
 * Parity comparison between a landing page served from api_v2 and the same
 * path on the static baseline (#3141). Pure functions: the crawler
 * (crawl.ts) fetches, this decides what counts as a difference.
 *
 * - status code and redirect target: must match exactly
 * - `<title>` and description: must match exactly
 * - `<main>` text: lenient. Whitespace is collapsed and markup ignored; fail
 *   below 98% word similarity, or when a heading or link target differs.
 */
import { JSDOM } from 'jsdom'

export const MIN_TEXT_SIMILARITY = 0.98

export interface PageSnapshot {
  status: number
  /** Redirect target, as a path when it stays on the page's own origin. */
  location: string | null
  title: string | null
  description: string | null
  /** Visible text of `<main>`, whitespace collapsed. */
  text: string
  headings: string[]
  links: string[]
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * A link or redirect target, comparable across hosts: same-origin URLs become
 * paths, a trailing slash is dropped, Vite's content hash is removed from
 * `/assets/` files (`/assets/x-AbC123_d.css` → `/assets/x.css`), and the
 * environment is dropped from sibling apps (`forms.staging.alpha.gov.bb` →
 * `forms.alpha.gov.bb`): each landing links to its own environment's forms,
 * chat and tracking apps, which isn't a content difference.
 */
export function normalizeTarget(href: string, pageUrl: string): string {
  let url: URL
  try {
    url = new URL(href, pageUrl)
  } catch {
    return href
  }
  const sameOrigin = url.origin === new URL(pageUrl).origin
  let path = url.pathname.replace(
    /^(\/assets\/.*)-[A-Za-z0-9_-]{8}(\.[a-z0-9]+)$/,
    '$1$2',
  )
  if (path.length > 1) path = path.replace(/\/+$/, '')
  const rest = path + url.search + url.hash
  if (sameOrigin) return rest
  const host = url.host.replace(
    /^([a-z0-9-]+)\.(?:sandbox|staging)\.alpha\.gov\.bb$/,
    '$1.alpha.gov.bb',
  )
  return `${url.protocol}//${host}${rest}`
}

export function snapshot(
  status: number,
  location: string | null,
  html: string,
  pageUrl: string,
): PageSnapshot {
  const { document } = new JSDOM(html).window
  const meta = (selector: string) =>
    document.querySelector(selector)?.getAttribute('content') ?? null
  const main = document.querySelector('main')
  main
    ?.querySelectorAll('script, style, template, noscript')
    .forEach((el) => el.remove())
  const title = document.querySelector('title')?.textContent
  return {
    status,
    location: location === null ? null : normalizeTarget(location, pageUrl),
    title: title == null ? null : collapse(title),
    description:
      meta('meta[name="description"]') ??
      meta('meta[property="og:description"]'),
    text: collapse(main?.textContent ?? ''),
    headings: [...(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? [])].map(
      (h) => collapse(h.textContent),
    ),
    links: [...(main?.querySelectorAll('a[href]') ?? [])].map((a) =>
      normalizeTarget(a.getAttribute('href') ?? '', pageUrl),
    ),
  }
}

/**
 * Word-level similarity, 0..1: twice the longest common subsequence over the
 * total word count (difflib's ratio). Common prefix and suffix are trimmed
 * first, so near-identical pages stay cheap.
 */
export function textSimilarity(a: string, b: string): number {
  const x = a.split(' ').filter(Boolean)
  const y = b.split(' ').filter(Boolean)
  const total = x.length + y.length
  if (total === 0) return 1
  let start = 0
  while (start < x.length && start < y.length && x[start] === y[start]) start++
  let endX = x.length
  let endY = y.length
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--
    endY--
  }
  const common = start + (x.length - endX)
  const xs = x.slice(start, endX)
  const ys = y.slice(start, endY)
  let prev = new Array<number>(ys.length + 1).fill(0)
  for (const word of xs) {
    const row = new Array<number>(ys.length + 1).fill(0)
    for (let j = 1; j <= ys.length; j++) {
      row[j] =
        word === ys[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1])
    }
    prev = row
  }
  return (2 * (common + prev[ys.length])) / total
}

/** Items of `a` not in `b`, as a multiset. */
function missing(a: string[], b: string[]): string[] {
  const left = [...b]
  return a.filter((item) => {
    const i = left.indexOf(item)
    if (i === -1) return true
    left.splice(i, 1)
    return false
  })
}

/** Every difference between the api_v2 page and its static baseline. */
export function comparePages(v2: PageSnapshot, base: PageSnapshot): string[] {
  const diffs: string[] = []
  const exact = (field: string, a: unknown, b: unknown) => {
    if (a !== b)
      diffs.push(`${field}: ${JSON.stringify(a)} ≠ static ${JSON.stringify(b)}`)
  }
  exact('status', v2.status, base.status)
  exact('redirect', v2.location, base.location)
  exact('title', v2.title, base.title)
  exact('description', v2.description, base.description)
  // A redirect or error page has no content worth comparing.
  if (diffs.length > 0 || v2.status !== 200) return diffs

  const similarity = textSimilarity(v2.text, base.text)
  if (similarity < MIN_TEXT_SIMILARITY)
    diffs.push(`main text ${(similarity * 100).toFixed(1)}% similar`)
  for (const [field, a, b] of [
    ['heading', v2.headings, base.headings],
    ['link', v2.links, base.links],
  ] as const) {
    for (const item of missing(b, a))
      diffs.push(`${field} missing: ${JSON.stringify(item)}`)
    for (const item of missing(a, b))
      diffs.push(`${field} not in static: ${JSON.stringify(item)}`)
  }
  return diffs
}
