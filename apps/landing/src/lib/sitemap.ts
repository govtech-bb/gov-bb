import { CATEGORIES } from '../content/categories'
import { PAGES, isCategoryVisible, isVisible } from '../content/registry'
import { PHARMACIES } from '../routes/health-and-emergency-services/find-an-open-pharmacy/-data/pharmacies'
import {
  PHARMACY_FIND_HREF,
  pharmacyDetailHref,
} from '../routes/health-and-emergency-services/find-an-open-pharmacy/-lib/routes'
import type { ViewLevel } from './frontmatter'

const PHARMACY_SERVICE_URL =
  'health-and-emergency-services/find-an-open-pharmacy'

export interface SitemapEntry {
  /** Absolute path with leading slash, e.g. "/services". */
  path: string
  priority: number
}

/**
 * Every anonymously-visible URL, in priority order: the home and services
 * pages, each public category and its subcategories, and each public content
 * page (excluding `/start` application entry sub-pages). Gated and preview-only
 * content is left out, mirroring what a public visitor can reach. Deduped so a
 * top-level page sharing a category slug can't appear twice.
 */
export function collectSitemapEntries(
  overlay?: ReadonlyMap<string, ViewLevel>,
): SitemapEntry[] {
  const entries: SitemapEntry[] = []
  const seen = new Set<string>()
  const add = (path: string, priority: number) => {
    if (seen.has(path)) return
    seen.add(path)
    entries.push({ path, priority })
  }

  add('/', 1)
  add('/services', 0.9)

  for (const cat of CATEGORIES) {
    if (!isCategoryVisible(cat, 'public', overlay)) continue
    add(`/${cat.slug}`, 0.8)
    for (const sub of cat.subcategories ?? []) {
      add(`/${cat.slug}/${sub.slug}`, 0.7)
    }
  }

  for (const page of PAGES) {
    if (!isVisible(page, 'public', overlay)) continue
    if (page.slug.endsWith('/start')) continue
    add(`/${page.url}`, 0.7)
  }

  // The pharmacy finder and its per-pharmacy detail pages are routes, not
  // registry pages — they enter the sitemap with the service page, once it
  // is publicly visible.
  const pharmacyService = PAGES.find(
    (page) => page.url === PHARMACY_SERVICE_URL,
  )
  if (pharmacyService && isVisible(pharmacyService, 'public', overlay)) {
    add(PHARMACY_FIND_HREF, 0.7)
    for (const pharmacy of PHARMACIES) {
      add(pharmacyDetailHref(pharmacy.name), 0.6)
    }
  }

  return entries
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function buildSitemapXml(
  entries: SitemapEntry[],
  siteUrl: string,
): string {
  const urls = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${xmlEscape(`${siteUrl}${e.path}`)}</loc>\n    <priority>${e.priority}</priority>\n  </url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}
