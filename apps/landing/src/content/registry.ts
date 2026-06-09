import { FrontmatterSchema, titleFromSlug } from '../lib/frontmatter'
import type { Frontmatter } from '../lib/frontmatter'
import type { Root } from 'hast'
import { bakeStartLinkFormId } from '../utils/markdown/plugins'
import type { MarkdownHeading } from '../utils/markdown/plugins'
import { CATEGORIES, CATEGORY_BY_SLUG, getSubcategory } from './categories'
import type { Category } from './categories'
import { FeatureMetaSchema } from './feature-meta'

export interface ContentPage {
  /** Relative slug derived from filename, e.g. "register-a-birth" or "register-a-birth/start". */
  slug: string
  /** Full URL path with category prefix when present. */
  url: string
  frontmatter: Frontmatter
  /** Raw markdown body, kept for the search index. Empty for feature pages. */
  body: string
  /** Build-time compiled body (see `vite-plugin-markdown.ts`). Empty root for feature pages. */
  hast: Root
  /** Section headings for the "On this page" nav. Empty for feature pages. */
  headings: Array<MarkdownHeading>
}

/** Shape each `*.md` file is compiled to by `vite-plugin-markdown.ts`. */
interface MarkdownModule {
  frontmatter: Record<string, unknown>
  body: string
  hast: Root
  headings: Array<MarkdownHeading>
}

const EMPTY_HAST: Root = { type: 'root', children: [] }

function slugFromPath(path: string): string {
  return path
    .replace(/^\.\//, '')
    .replace(/\/index\.md$/, '')
    .replace(/\.md$/, '')
}

/** The slug one level up (`a/b/c` → `a/b`), or undefined at the top level. */
function parentSlug(slug: string): string | undefined {
  const i = slug.lastIndexOf('/')
  return i === -1 ? undefined : slug.slice(0, i)
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

const modules = import.meta.glob<MarkdownModule>('./**/*.md', { eager: true })

const markdownPages: Array<ContentPage> = Object.entries(modules).map(
  ([path, mod]) => {
    const slug = slugFromPath(path)
    const parsed = FrontmatterSchema.safeParse(mod.frontmatter)
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
    const frontmatter: Frontmatter = {
      title: raw.title ?? titleFromSlug(slug),
      description: raw.description,
      categories,
      subcategory: raw.subcategory,
      publish_date: raw.publish_date,
      source_url: raw.source_url,
      stage: raw.stage,
      visibility: raw.visibility,
      featured: raw.featured,
      section: raw.section,
      service_type: raw.service_type,
      form_id: raw.form_id,
    }
    /** Canonical URL: category + optional subcategory + leaf; uncategorised pages live at the root. */
    const primaryCategory = categories[0]
    const leaf = leafFromSlug(slug, primaryCategory, raw.subcategory)
    const urlParts = [primaryCategory, raw.subcategory, leaf].filter(
      (part): part is string => Boolean(part),
    )
    const url = urlParts.join('/')
    bakeStartLinkFormId(mod.hast, raw.form_id)
    return {
      slug,
      url,
      frontmatter,
      body: mod.body,
      hast: mod.hast,
      headings: mod.headings,
    }
  },
)

/**
 * Co-located feature modules self-register here. An interactive feature lives in
 * its own folder under src/routes/<url>/ with a `-meta.ts` (the leading dash
 * makes TanStack's router generator ignore it, and its sibling `-ui`/`-data`/
 * `-lib` dirs, while the route files alongside become real routes). Each META is
 * validated and folded into the same list as markdown services, so listings,
 * search, breadcrumbs and the preview gate treat them identically with no
 * per-feature code. Adding a feature never touches this file.
 */
// Import only the named `META` export, not each module's full namespace. The
// namespace form makes the Rolldown-based bundler (Vite 8) wrap every matched
// module in an `__exportAll(...)` helper call; in the SSR build that helper
// collided with a hoisted local of the same name, throwing
// "TypeError: __exportAll is not a function" at module init and 500ing every
// page. Selecting the single export we use sidesteps the namespace wrappers
// (and is what this code wants anyway).
const featureMetaModules = import.meta.glob('../routes/**/-meta.ts', {
  eager: true,
  import: 'META',
})

const featurePages: Array<ContentPage> = Object.entries(featureMetaModules).map(
  ([path, meta_]) => {
    const parsed = FeatureMetaSchema.safeParse(meta_)
    if (!parsed.success) {
      throw new Error(
        `Invalid META in ${path.replace(/^\.\.\//, 'src/')}: ${parsed.error.message}`,
      )
    }
    const meta = parsed.data
    if (!CATEGORY_BY_SLUG[meta.category]) {
      throw new Error(
        `Feature "${meta.url}" references unknown category "${meta.category}". Add it to src/content/categories.ts.`,
      )
    }
    if (meta.subcategory && !getSubcategory(meta.category, meta.subcategory)) {
      throw new Error(
        `Feature "${meta.url}" sets subcategory "${meta.subcategory}" but category "${meta.category}" does not declare it.`,
      )
    }
    const frontmatter: Frontmatter = {
      title: meta.title,
      description: meta.description,
      categories: [meta.category],
      subcategory: meta.subcategory,
      visibility: meta.visibility,
      keywords: meta.keywords,
    }
    const slug = meta.url.split('/').pop() ?? meta.url
    return {
      slug,
      url: meta.url,
      frontmatter,
      body: '',
      hast: EMPTY_HAST,
      headings: [],
    }
  },
)

const ownUrlPages: Array<ContentPage> = [...markdownPages, ...featurePages]
const pageBySlug = new Map(ownUrlPages.map((p) => [p.slug, p]))

/**
 * A step page (its parent slug is itself a page, e.g. `<service>/start`) hangs
 * off its parent's URL, so it needs no `category` of its own.
 */
function urlWithParent(page: ContentPage): string {
  const parent = parentSlug(page.slug)
  const parentPage = parent ? pageBySlug.get(parent) : undefined
  if (!parentPage) return page.url
  const leaf = page.slug.slice(page.slug.lastIndexOf('/') + 1)
  return `${urlWithParent(parentPage)}/${leaf}`
}

export const PAGES: Array<ContentPage> = ownUrlPages.map((page) => ({
  ...page,
  url: urlWithParent(page),
}))

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
  const parent = parentSlug(page.slug)
  return parent !== undefined && BY_SLUG.has(parent)
}

/**
 * A page is *effectively preview* if its own `visibility` is `preview` or any
 * ancestor page is. Walking ancestors by slug means flagging a service's
 * `index.md` automatically hides its `/start` (and other) sub-pages, which sit
 * at `<service>/<leaf>`. Slug-keyed (not URL) so it is independent of the
 * category prefix — a sub-page's URL hangs off its parent's, but its slug is
 * always `<parentSlug>/<leaf>`.
 */
export function isPreview(page: ContentPage): boolean {
  return resolveIsPreview(
    page.slug,
    (slug) => BY_SLUG.get(slug)?.frontmatter.visibility,
  )
}

/**
 * Pure core of {@link isPreview}, decoupled from module state for testing:
 * walk `slug` and each ancestor slug, returning true if any is `preview`.
 * `visibilityOf` returns the *own* visibility of a slug, or undefined if no
 * page sits at that slug (intermediate directory).
 */
export function resolveIsPreview(
  slug: string,
  visibilityOf: (slug: string) => 'public' | 'preview' | undefined,
): boolean {
  let current: string | undefined = slug
  while (current) {
    if (visibilityOf(current) === 'preview') return true
    current = parentSlug(current)
  }
  return false
}

/** A page is visible when in preview mode, or when it isn't effectively preview. */
export function isVisible(page: ContentPage, inPreview: boolean): boolean {
  return inPreview || !isPreview(page)
}

/**
 * Whether the page at `url` is effectively preview. Used by the static
 * `<service>/form` routes to gate themselves on their owning service page.
 * Unknown URLs are treated as not-preview (fail-open: a missing page already
 * 404s through its own route).
 */
export function isUrlPreview(url: string): boolean {
  const page = findPage(url)
  return page ? isPreview(page) : false
}

/**
 * Whether this page's `<slug>/start` sub-page exists and is effectively
 * preview. Drives hiding the online-application method on a still-public parent
 * page (see rehype-hide-start-links). Pages with no `/start` sub-page return
 * false and keep their existing manifest-gated behaviour.
 */
export function startSubPageInPreview(page: ContentPage): boolean {
  const start = BY_SLUG.get(`${page.slug}/start`)
  return start ? isPreview(start) : false
}

/**
 * Canonical URL keyed by a page's leaf slug (last path segment). Used to
 * rewrite the bare-slug links authored in organisation content — e.g. a
 * ministry listing `/get-a-document-notarised` — to the category-prefixed
 * route that actually resolves
 * (`/travel-id-citizenship/get-a-document-notarised`).
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

/**
 * The listable service pages of a category under the current mode: non-sub-page
 * pages that claim the category and are visible. Sub-category pages are included
 * (they carry the parent slug in `categories`); callers narrow by subcategory.
 * The single source for "what shows under a category" — both the category
 * listings and the visibility gate read it, so they can never disagree.
 */
export function categoryServices(
  categorySlug: string,
  inPreview: boolean,
): Array<ContentPage> {
  return PAGES.filter(
    (p) =>
      p.frontmatter.categories.includes(categorySlug) &&
      !isSubPage(p) &&
      isVisible(p, inPreview),
  )
}

/**
 * A category is visible when it has at least one listable service under the
 * current mode. A category whose only services are `preview` (or that has none)
 * is dropped from the public home list and 404s when visited directly; a
 * reviewer in preview mode still sees it.
 */
export function isCategoryVisible(
  category: Category,
  inPreview: boolean,
): boolean {
  return categoryServices(category.slug, inPreview).length > 0
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
