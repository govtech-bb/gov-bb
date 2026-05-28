// Runtime CMS client for the landing site.
//
// Read-only access to the Payload REST API: categories, subcategories, and
// published services. All queries pass `where[_status][equals]=published`
// where versioning applies; categories/subcategories have no draft state.
//
// Used by route loaders via `queryClient.ensureQueryData(...)` so each query
// SSRs through `@tanstack/react-router-ssr-query` and rehydrates on the client.

import { queryOptions } from '@tanstack/react-query'

const CMS_URL = import.meta.env.VITE_CMS_URL ?? 'http://localhost:8000'

export interface CmsCategory {
  slug: string
  title: string
  description?: string
  order: number
}

export interface CmsSubcategory {
  slug: string
  title: string
  description?: string
}

export interface CmsServiceListItem {
  /** Canonical site URL path, e.g. "travel-id-citizenship/apply-for-a-passport". */
  url: string
  /** CMS slug — may equal `url` for already-nested slugs, or be the bare leaf. */
  slug: string
  title: string
  description?: string
  stage?: 'alpha' | 'beta' | 'migrated'
  serviceType?: 'digital' | 'information'
  categories: string[]
  subcategory?: string
}

interface PayloadList<T> {
  docs: T[]
}

interface PayloadCategoryDoc {
  slug: string
  title: string
  description?: string | null
  order: number
}

interface PayloadSubcategoryDoc {
  slug: string
  title: string
  description?: string | null
}

interface PayloadRelationship {
  slug?: string | null
}

interface PayloadServiceDoc {
  slug: string
  title: string
  description?: string | null
  stage?: 'alpha' | 'beta' | 'migrated' | null
  serviceType?: 'digital' | 'information' | null
  categories?: Array<PayloadRelationship | string | number> | null
  subcategory?: PayloadRelationship | string | number | null
}

// 3s upper bound per fetch — bounds SSR latency when the CMS is slow/down,
// and the route loader's try/catch / errorComponent takes over from there.
const CMS_FETCH_TIMEOUT_MS = 3000

async function cmsFetch<T>(path: string): Promise<PayloadList<T>> {
  const res = await fetch(`${CMS_URL}${path}`, {
    signal: AbortSignal.timeout(CMS_FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`CMS request failed: ${res.status} ${path}`)
  }
  return res.json() as Promise<PayloadList<T>>
}

function slugOf(
  rel: PayloadRelationship | string | number | null | undefined,
): string | undefined {
  if (!rel || typeof rel !== 'object') return undefined
  return rel.slug ?? undefined
}

// Mirror registry.ts's URL construction so CMS-fed listings hit the same
// canonical paths the splat route resolves to.
function urlFromService(
  slug: string,
  categorySlug: string | undefined,
  subcategorySlug: string | undefined,
): string {
  let leaf = slug
  if (categorySlug && subcategorySlug) {
    const prefix = `${categorySlug}/${subcategorySlug}/`
    if (leaf.startsWith(prefix)) leaf = leaf.slice(prefix.length)
  }
  if (categorySlug) {
    const prefix = `${categorySlug}/`
    if (leaf.startsWith(prefix)) leaf = leaf.slice(prefix.length)
  }
  return [categorySlug, subcategorySlug, leaf].filter(Boolean).join('/')
}

function normaliseService(doc: PayloadServiceDoc): CmsServiceListItem {
  const categories = (doc.categories ?? [])
    .map(slugOf)
    .filter((s): s is string => Boolean(s))
  const subcategory = slugOf(doc.subcategory)
  return {
    url: urlFromService(doc.slug, categories[0], subcategory),
    slug: doc.slug,
    title: doc.title,
    description: doc.description ?? undefined,
    stage: doc.stage ?? undefined,
    serviceType: doc.serviceType ?? undefined,
    categories,
    subcategory,
  }
}

const PUBLISHED = 'where[_status][equals]=published'

export async function fetchCategories(): Promise<CmsCategory[]> {
  const res = await cmsFetch<PayloadCategoryDoc>(
    '/api/categories?sort=order&limit=100',
  )
  return res.docs.map((d) => ({
    slug: d.slug,
    title: d.title,
    description: d.description ?? undefined,
    order: d.order,
  }))
}

export async function fetchSubcategoriesByCategory(
  categorySlug: string,
): Promise<CmsSubcategory[]> {
  const res = await cmsFetch<PayloadSubcategoryDoc>(
    `/api/subcategories?where[parent.slug][equals]=${encodeURIComponent(categorySlug)}&limit=100`,
  )
  return res.docs.map((d) => ({
    slug: d.slug,
    title: d.title,
    description: d.description ?? undefined,
  }))
}

export async function fetchServicesByCategory(
  categorySlug: string,
): Promise<CmsServiceListItem[]> {
  const res = await cmsFetch<PayloadServiceDoc>(
    `/api/services?${PUBLISHED}&where[categories.slug][in]=${encodeURIComponent(categorySlug)}&depth=1&sort=title&limit=200`,
  )
  return res.docs
    .map(normaliseService)
    .filter((s) => !s.slug.endsWith('/start'))
}

export async function fetchServicesBySubcategory(
  categorySlug: string,
  subcategorySlug: string,
): Promise<CmsServiceListItem[]> {
  const res = await cmsFetch<PayloadServiceDoc>(
    `/api/services?${PUBLISHED}` +
      `&where[categories.slug][in]=${encodeURIComponent(categorySlug)}` +
      `&where[subcategory.slug][equals]=${encodeURIComponent(subcategorySlug)}` +
      `&depth=1&sort=title&limit=200`,
  )
  return res.docs
    .map(normaliseService)
    .filter((s) => !s.slug.endsWith('/start'))
}

export async function fetchAllServices(): Promise<CmsServiceListItem[]> {
  const res = await cmsFetch<PayloadServiceDoc>(
    `/api/services?${PUBLISHED}&depth=1&sort=title&limit=500`,
  )
  return res.docs
    .map(normaliseService)
    .filter((s) => !s.slug.endsWith('/start'))
}

// Query options — passed to `queryClient.ensureQueryData` in loaders and to
// `useSuspenseQuery` in components.

export const categoriesQueryOptions = () =>
  queryOptions({
    queryKey: ['cms', 'categories'] as const,
    queryFn: fetchCategories,
  })

export const subcategoriesByCategoryQueryOptions = (categorySlug: string) =>
  queryOptions({
    queryKey: ['cms', 'subcategories', categorySlug] as const,
    queryFn: () => fetchSubcategoriesByCategory(categorySlug),
  })

export const servicesByCategoryQueryOptions = (categorySlug: string) =>
  queryOptions({
    queryKey: ['cms', 'services', 'by-category', categorySlug] as const,
    queryFn: () => fetchServicesByCategory(categorySlug),
  })

export const servicesBySubcategoryQueryOptions = (
  categorySlug: string,
  subcategorySlug: string,
) =>
  queryOptions({
    queryKey: [
      'cms',
      'services',
      'by-subcategory',
      categorySlug,
      subcategorySlug,
    ] as const,
    queryFn: () => fetchServicesBySubcategory(categorySlug, subcategorySlug),
  })

export const allServicesQueryOptions = () =>
  queryOptions({
    queryKey: ['cms', 'services', 'all'] as const,
    queryFn: fetchAllServices,
  })

export const CMS_CACHE_HEADERS: Record<string, string> = {
  // CDN serves cached HTML for 5 minutes, then revalidates in the background
  // for 60s before hitting Lambda. Editorial content; not user-specific.
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
}

// Used on error responses so a 5-minute CDN cache doesn't pin the
// "temporarily unavailable" page after the CMS recovers.
export const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, max-age=0',
}

/**
 * Picks `NO_STORE_HEADERS` when the loader errored (so the error HTML is not
 * CDN-cached for 5 minutes), otherwise `CMS_CACHE_HEADERS`. Pass a route
 * match's `status` from the `headers()` ctx.
 */
export function cmsRouteHeaders(
  matchStatus: string | undefined,
): Record<string, string> {
  return matchStatus === 'error' ? NO_STORE_HEADERS : CMS_CACHE_HEADERS
}
