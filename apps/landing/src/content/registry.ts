import { FrontmatterSchema, titleFromSlug } from '../lib/frontmatter'
import { parseFrontmatter } from '../lib/parse-frontmatter'
import type { Frontmatter } from '../lib/frontmatter'
import { CATEGORIES, CATEGORY_BY_SLUG, getSubcategory } from './categories'

export interface ContentPage {
  /** Relative slug derived from filename, e.g. "register-a-birth" or "register-a-birth/start". */
  slug: string
  /** Full URL path with category prefix when present. */
  url: string
  frontmatter: Frontmatter
  body: string
}

function slugFromPath(path: string): string {
  return path
    .replace(/^\.\//, '')
    .replace(/\/index\.md$/, '')
    .replace(/\.md$/, '')
}

/**
 * Strip a leading `<category>/<subcategory>/` or `<category>/` prefix from the slug
 * when content files are nested under those directories. The URL is then rebuilt
 * from category + subcategory + remaining leaf, so nesting on disk doesn't double up.
 */
function leafFromSlug(
  slug: string,
  category: string | undefined,
  subcategory: string | undefined,
): string {
  if (category && subcategory) {
    const prefix = `${category}/${subcategory}/`
    if (slug.startsWith(prefix)) return slug.slice(prefix.length)
  }
  if (category) {
    const prefix = `${category}/`
    if (slug.startsWith(prefix)) return slug.slice(prefix.length)
  }
  return slug
}

// Organisation MDs (government/organisations/*.md) have their own loader and
// content shape — they aren't content pages and must not be parsed by the
// page registry's FrontmatterSchema.
const modules = import.meta.glob(
  ['./**/*.md', '!./government/organisations/**'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
)

export const PAGES: Array<ContentPage> = Object.entries(modules).map(
  ([path, source]) => {
    const slug = slugFromPath(path)
    const { data, content } = parseFrontmatter(source as string)
    const parsed = FrontmatterSchema.safeParse(data)
    if (!parsed.success) {
      throw new Error(
        `Invalid frontmatter in src/content/${path.replace(/^\.\//, '')}: ${parsed.error.message}`,
      )
    }
    const raw = parsed.data
    const categories = Array.from(
      new Set([
        ...(raw.category ? [raw.category] : []),
        ...(raw.categories ?? []),
      ]),
    )
    for (const catSlug of categories) {
      if (!CATEGORY_BY_SLUG[catSlug]) {
        throw new Error(
          `Page "${slug}" references unknown category "${catSlug}". Add it to src/content/categories.ts.`,
        )
      }
    }
    if (raw.subcategory) {
      const owningCategory = categories.find((catSlug) =>
        Boolean(getSubcategory(catSlug, raw.subcategory!)),
      )
      if (!owningCategory) {
        throw new Error(
          `Page "${slug}" sets subcategory "${raw.subcategory}" but none of its categories declare it. Add the sub-category to src/content/categories.ts or remove the field.`,
        )
      }
    }
    const {
      category: _legacyCategory,
      categories: _legacyCategories,
      ...rest
    } = raw
    const frontmatter: Frontmatter = {
      ...rest,
      title: raw.title ?? titleFromSlug(slug),
      categories,
      subcategory: raw.subcategory,
    }
    /** Canonical URL: category + optional subcategory + leaf; uncategorised pages live at the root. */
    const primaryCategory = categories[0]
    const leaf = leafFromSlug(slug, primaryCategory, raw.subcategory)
    const urlParts = [primaryCategory, raw.subcategory, leaf].filter(
      (part): part is string => Boolean(part),
    )
    const url = urlParts.join('/')
    return { slug, url, frontmatter, body: content }
  },
)

const BY_URL = new Map(PAGES.map((p) => [p.url, p]))
const BY_SLUG = new Map(PAGES.map((p) => [p.slug, p]))

export function findPage(urlPath: string): ContentPage | undefined {
  return BY_URL.get(urlPath.replace(/^\/+|\/+$/g, ''))
}

/**
 * A page is a sub-page when its parent *slug* is itself a page — e.g. the
 * `calculate-severance-pay/start` step lives in the same directory as the
 * service page `calculate-severance-pay` (its `index.md`). Sub-pages are
 * reached from their parent's detail page, so they are excluded from
 * category/subcategory listings to avoid duplicate entries.
 *
 * Keyed on slug, not URL: the slug mirrors the on-disk directory structure
 * and is independent of categories, so this stays correct when a service
 * lives in more than one category (the URL only carries the primary one).
 * Pages nested only under a category/subcategory directory — with no parent
 * page — are not sub-pages and stay listed.
 */
export function isSubPage(page: ContentPage): boolean {
  const i = page.slug.lastIndexOf('/')
  if (i < 0) return false
  return BY_SLUG.has(page.slug.slice(0, i))
}

/**
 * Canonical URL keyed by a page's leaf slug (last path segment). Used to
 * rewrite the bare-slug links authored in organisation content — e.g. a
 * ministry listing `/apply-for-a-passport` — to the category-prefixed route
 * that actually resolves (`/travel-id-citizenship/apply-for-a-passport`).
 * Leaves shared by multiple pages (e.g. step pages named `start`) are
 * ambiguous and dropped so they never resolve to the wrong page.
 */
const URL_BY_LEAF = (() => {
  const byLeaf = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (const p of PAGES) {
    const leaf = p.url.split('/').pop()
    if (!leaf) continue
    if (byLeaf.has(leaf)) ambiguous.add(leaf)
    else byLeaf.set(leaf, p.url)
  }
  for (const leaf of ambiguous) byLeaf.delete(leaf)
  return byLeaf
})()

/**
 * Resolve an authored service link to the canonical site path. Handles an
 * already-correct path (unchanged) and a bare service slug (rewritten to its
 * category-prefixed URL). Anything else — external/mailto/tel links, org
 * paths, or an unknown slug — is returned unchanged so a link is never
 * silently broken or mis-pointed.
 */
export function resolveServiceHref(href: string): string {
  if (!href.startsWith('/')) return href
  const key = href.replace(/^\/+|\/+$/g, '')
  if (!key) return href
  if (BY_URL.has(key)) return `/${key}`
  if (!key.includes('/')) {
    const url = URL_BY_LEAF.get(key)
    if (url) return `/${url}`
  }
  return href
}

export { CATEGORIES, CATEGORY_BY_SLUG }

export function getCategoryTitle(slug: string): string | undefined {
  return CATEGORY_BY_SLUG[slug]?.title
}

export function getSubcategoryTitle(
  categorySlug: string,
  subcategorySlug: string,
): string | undefined {
  return getSubcategory(categorySlug, subcategorySlug)?.title
}

export function getPageTitle(slug: string): string | undefined {
  return PAGES.find((p) => p.slug.split('/').pop() === slug)?.frontmatter.title
}
