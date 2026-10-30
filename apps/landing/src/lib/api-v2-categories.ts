import { createServerFn } from '@tanstack/react-start'
import { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { API_V2_TIMEOUT_MS, apiV2Base, siteVersionChanges } from './api-v2-page'
import { logFallback, message } from './api-v2-log'

/**
 * Categories from api_v2's public reads (ADR 0078). When `VITE_API_V2_URL` is
 * set the site lists the categories api_v2 serves, at request time; unset, the
 * static taxonomy in `content/categories.ts` stays in charge.
 *
 * Unlike a page miss, a failed category read never falls back to the static
 * taxonomy: that would bring back categories an editor removed or renamed. So
 * every outcome is explicit and the caller decides what an outage shows.
 *
 * Only the public `/categories` reads, with no preview token: the editor's
 * `/editor/categories` carries private counts and is never called from here.
 */

/** Copied from apps/api_v2/src/modules/navigation.ts (`CategoryRef`). */
const CategoryRef = z.object({
  slug: z.string(),
  /** `/<category>`, or `/<category>/<subcategory>`. */
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
})

/** A category as the site links to it. */
export type CategoryRef = z.infer<typeof CategoryRef>

const CategoryNode = CategoryRef.extend({ subcategories: z.array(CategoryRef) })

/** A category with the subcategories it lists. */
export type CategoryNode = z.infer<typeof CategoryNode>

const CategoryTreeBody = z.object({ categories: z.array(CategoryNode) })

/** Copied from apps/api_v2/src/modules/navigation.ts (`CategoryListing`). */
const CategoryListing = z.object({
  category: CategoryRef,
  parent: CategoryRef.nullable(),
  /** Those with something to list, in order. */
  subcategories: z.array(CategoryRef),
  /** The pages at the category's root, A to Z. */
  pages: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      digital: z.boolean(),
    }),
  ),
})

/** A category page: its own pages and the subcategories beneath it. */
export type CategoryListing = z.infer<typeof CategoryListing>

/** Why a category read has nothing to show. */
type CategoryReadFailure = { kind: 'unavailable' } | { kind: 'malformed' }

/** The categories the site lists, or why they can't be shown. */
export type CategoryTreeResult =
  | { kind: 'disabled' }
  | { kind: 'found'; categories: CategoryNode[] }
  | CategoryReadFailure

/** A category page, or why there isn't one to show. */
export type CategoryListingResult =
  | { kind: 'disabled' }
  | { kind: 'found'; listing: CategoryListing }
  | { kind: 'not_found' }
  | CategoryReadFailure

/**
 * A category path, `[category]` or `[category, subcategory]`, as it crosses
 * the server-function boundary: parsed there, since the caller is a browser.
 */
export const CategoryPath = z.union([
  z.tuple([z.string()]),
  z.tuple([z.string(), z.string()]),
])

/** A category path: `[category]` or `[category, subcategory]`. */
export type CategoryPath = z.infer<typeof CategoryPath>

/**
 * GET a public api_v2 read, parsed; `missing` is a 404 the caller may expect.
 * Any other miss logs an `api_v2_fallback` line (contract in api-v2-page.ts).
 */
async function readPublic<T>(
  base: string,
  path: string,
  schema: z.ZodType<T>,
  fetchImpl: typeof fetch,
): Promise<
  { kind: 'ok'; value: T } | { kind: 'missing' } | CategoryReadFailure
> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_V2_TIMEOUT_MS)

  try {
    const response = await fetchImpl(`${base}${path}`, {
      signal: controller.signal,
    })

    if (response.status === 404) {
      // Release the socket: an unread body pins a keep-alive connection.
      await response.body?.cancel()

      return { kind: 'missing' }
    }

    if (response.status !== 200) {
      logFallback('status', path, { status: response.status })
      await response.body?.cancel()

      return { kind: 'unavailable' }
    }

    const body: unknown = await response.json().catch(() => undefined)
    const parsed = schema.safeParse(body)

    if (parsed.success) return { kind: 'ok', value: parsed.data }
    if (controller.signal.aborted) throw new Error('timed out reading the body')
    logFallback('malformed', path)

    return { kind: 'malformed' }
  } catch (error) {
    const reason = controller.signal.aborted ? 'timeout' : 'network'
    logFallback(reason, path, { error: message(error) })

    return { kind: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}

/** `GET /categories`: every category the public can browse, in order. */
export async function fetchCategoryTree(
  base: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<CategoryTreeResult> {
  if (!base) return { kind: 'disabled' }

  const result = await readPublic(
    base,
    '/categories',
    CategoryTreeBody,
    fetchImpl,
  )

  switch (result.kind) {
    case 'ok':
      return { kind: 'found', categories: result.value.categories }
    // The tree route always exists; a 404 means api_v2 isn't serving it.
    case 'missing':
      logFallback('status', '/categories', { status: 404 })
      return { kind: 'unavailable' }
    default:
      return result
  }
}

/** A category slug, as api_v2 accepts one (ADR 0078). */
const CATEGORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * `GET /categories/:slug[/:sub]`: one category page, or not found. A segment
 * that can't be a slug (`..`, `a/b`) is not found without a request, so a
 * visitor's URL can never reach another api_v2 route.
 */
export async function fetchCategoryListing(
  base: string | null,
  path: CategoryPath,
  fetchImpl: typeof fetch = fetch,
): Promise<CategoryListingResult> {
  if (!base) return { kind: 'disabled' }

  if (!path.every((segment) => CATEGORY_SLUG.test(segment)))
    return { kind: 'not_found' }

  const result = await readPublic(
    base,
    `/categories/${path.join('/')}`,
    CategoryListing,
    fetchImpl,
  )

  switch (result.kind) {
    case 'ok':
      return { kind: 'found', listing: result.value }
    case 'missing':
      return { kind: 'not_found' }
    default:
      return result
  }
}

/** What a one- or two-segment address is, in api_v2 mode. */
export type CategoryAddress =
  | { kind: 'listing'; listing: CategoryListing }
  | { kind: 'not_category' }
  | CategoryReadFailure

/**
 * Whether `segments` is a category page, in api_v2 mode. The tree lists every
 * category with something to show, as listings do, so an address
 * it doesn't list is a page without asking api_v2 again. Without a tree, the
 * listing is asked directly: an unreadable tree must not hide a category, nor
 * fall back to the static taxonomy. A missing category is not an error; the
 * caller tries the address as a page.
 */
export async function resolveCategoryAddress(
  segments: readonly string[],
  tree: Exclude<CategoryTreeResult, { kind: 'disabled' }>,
  readListing: (path: CategoryPath) => Promise<CategoryListingResult>,
): Promise<CategoryAddress> {
  const path: CategoryPath | null =
    segments.length === 1
      ? [segments[0]]
      : segments.length === 2
        ? [segments[0], segments[1]]
        : null

  if (path === null) return { kind: 'not_category' }

  if (tree.kind === 'found') {
    const url = `/${path.join('/')}`

    const listed = tree.categories.some(
      (category) =>
        category.url === url ||
        category.subcategories.some((sub) => sub.url === url),
    )

    if (!listed) return { kind: 'not_category' }
  }

  const result = await readListing(path)

  switch (result.kind) {
    case 'found':
      return { kind: 'listing', listing: result.listing }
    case 'not_found':
    case 'disabled':
      return { kind: 'not_category' }
    default:
      return result
  }
}

const publicCategoryCache = new QueryClient()

/** Public category reads shared across server requests, never the router's private viewer state. */
export function fetchCachedCategoryTree(base: string | null) {
  return publicCategoryCache.fetchQuery({
    ...categoryTreeQuery(() => fetchCategoryTree(base)),
    queryKey: ['public-category-tree', base],
  })
}

/** Site version moves the cached tree has been expired for. */
let treeChanges = 0

/** Server function: the cached public tree from the configured api_v2,
 *  expired when api_v2's site version moves, as the page cache is. */
export const getApiV2CategoryTree = createServerFn().handler(async () => {
  const changes = await siteVersionChanges()
  if (changes !== treeChanges) {
    treeChanges = changes
    await publicCategoryCache.invalidateQueries()
  }
  return fetchCachedCategoryTree(apiV2Base())
})

/** Server function: `fetchCategoryListing` against the configured api_v2. */
export const getApiV2CategoryListing = createServerFn()
  .validator(CategoryPath)
  .handler(({ data: path }) => fetchCategoryListing(apiV2Base(), path))

/** A minute per cache layer, within api_v2's freshness/revalidation window. */
export const CATEGORY_TREE_STALE_MS = 60_000

/**
 * The public category tree, read once per QueryClient (one per request on the
 * server, one per tab in the browser) and reread once it is a minute old. A
 * failed read waits the same minute, so a down api_v2 doesn't add its timeout
 * to every navigation. The server function also caches the public response
 * between requests, separately from each request's viewer state. Disabled
 * never changes within a build.
 *
 * The tree is optional to every route that shows it, so the query never
 * rejects: a server-function call that fails in the browser is `unavailable`.
 */
export function categoryTreeQuery(
  load: () => Promise<CategoryTreeResult> = () => getApiV2CategoryTree(),
) {
  return {
    queryKey: ['root', 'category-tree'] as const,
    queryFn: async (): Promise<CategoryTreeResult> => {
      try {
        return await load()
      } catch (error) {
        // Only in the browser: landing's server function failed, not api_v2.
        console.warn('category tree read failed:', error)

        return { kind: 'unavailable' }
      }
    },
    staleTime: ({ state }: { state: { data?: CategoryTreeResult } }) =>
      state.data?.kind === 'disabled' ? Infinity : CATEGORY_TREE_STALE_MS,
    // Keep disabled mode for this client's lifetime; staleTime still refreshes API reads.
    gcTime: Infinity,
  }
}
