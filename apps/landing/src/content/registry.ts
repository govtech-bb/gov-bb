import matter from 'gray-matter'
import {
  FrontmatterSchema,
  titleFromSlug
  
} from '../lib/frontmatter'
import type {Frontmatter} from '../lib/frontmatter';
import { CATEGORIES, CATEGORY_BY_SLUG } from './categories'

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
    const { category: _legacyCategory, categories: _legacyCategories, ...rest } = raw
    const frontmatter: Frontmatter = {
      ...rest,
      title: raw.title ?? titleFromSlug(slug),
      categories,
    }
    /** Canonical URL: first claimed category wins; uncategorised pages live at the root. */
    const url = categories[0] ? `${categories[0]}/${slug}` : slug
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

export function getPageTitle(slug: string): string | undefined {
  return PAGES.find((p) => p.slug.split('/').pop() === slug)?.frontmatter.title
}
