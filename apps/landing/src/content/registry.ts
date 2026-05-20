import matter from 'gray-matter'
import { FrontmatterSchema, titleFromSlug } from '../lib/frontmatter'
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

const modules = import.meta.glob('./**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const PAGES: Array<ContentPage> = Object.entries(modules).map(
  ([path, source]) => {
    const slug = slugFromPath(path)
    const { data, content } = matter(source)
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

export function findPage(urlPath: string): ContentPage | undefined {
  return BY_URL.get(urlPath.replace(/^\/+|\/+$/g, ''))
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
