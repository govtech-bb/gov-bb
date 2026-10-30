import {
  getCategoryTitle,
  getPageTitle,
  getSubcategoryTitle,
} from '../content/registry'
import { getSubcategory } from '../content/categories'
import type { CategoryTreeResult } from './api-v2-categories'
import { breadcrumbPaths } from './breadcrumb-hierarchy'

/** One step of a breadcrumb trail; `url` is a site path with a leading slash. */
export interface Crumb {
  name: string
  url: string
}

function titleCase(slug: string): string {
  const raw = slug.replace(/-/g, ' ')

  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/** A label for a segment that is not a category: a page title, else the slug. */
function pageLabel(segment: string): string {
  return getPageTitle(segment) ?? titleCase(segment)
}

/** The static taxonomy's label, as landing has always shown it. */
function staticLabel(segment: string, previous?: string): string {
  const sub = previous ? getSubcategoryTitle(previous, segment) : undefined

  return getCategoryTitle(segment) ?? sub ?? pageLabel(segment)
}

/**
 * The label api_v2's public tree gives a path, or null where a category should
 * be but the tree doesn't list it (empty, removed or unreadable), so the trail
 * leaves it out rather than showing a stale name or linking to a 404.
 */
function apiLabel(
  path: string,
  depth: number,
  tree: CategoryTreeResult,
): string | null {
  const segments = path.split('/')
  const url = `/${path}`
  const categories = tree.kind === 'found' ? tree.categories : []

  if (depth === 0) {
    return categories.find((category) => category.url === url)?.title ?? null
  }

  if (depth === 1) {
    const sub = categories
      .flatMap((category) => category.subcategories)
      .find((category) => category.url === url)

    if (sub) return sub.title

    // A static subcategory name is a category api_v2 owns now, not a page.
    if (getSubcategory(segments[0], segments[1])) return null
  }

  return pageLabel(segments[depth])
}

/**
 * The trail above `pathname`, Home and the current page left out. Category
 * labels come from api_v2's tree when it is configured, else from the static
 * taxonomy; other steps (a finder's service page, say) keep their page labels.
 */
export function ancestorTrail(
  pathname: string,
  tree: CategoryTreeResult,
): Crumb[] {
  const crumbs: Crumb[] = []
  breadcrumbPaths(pathname)
    .slice(0, -1)
    .forEach((path, depth) => {
      const segments = path.split('/')

      const name =
        tree.kind === 'disabled'
          ? staticLabel(segments[depth], segments[depth - 1])
          : apiLabel(path, depth, tree)

      if (name !== null) crumbs.push({ name, url: `/${path}` })
    })

  return crumbs
}

/** A path as the trail links to it: one leading slash, whatever api_v2 sent. */
export function sitePath(url: string): string {
  return `/${url.replace(/^\/+/, '')}`
}
