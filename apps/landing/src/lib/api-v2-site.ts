import { createServerFn } from '@tanstack/react-start'
import { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { readPublic } from './api-v2-categories'
import { apiV2Base } from './api-v2-page'

/**
 * The site-wide lists api_v2 serves to the public (#3125): every page for the
 * sitemap, and every page's text for search. With no preview token api_v2
 * lists public pages only, so drafts and previews never reach either.
 *
 * Each list is cached per server instance for a minute. A failed read serves
 * the last good list, or none on a cold start, and waits the same minute.
 */

/** Copied from apps/api_v2/src/modules/navigation.ts (`CatalogEntry`), the url only. */
const CatalogBody = z.object({ pages: z.array(z.object({ url: z.string() })) })

/** Copied from apps/api_v2/src/modules/navigation.ts (`SearchDocument`). */
const SearchDocument = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  digital: z.boolean(),
  keywords: z.array(z.string()),
  chunks: z.array(
    z.object({ heading: z.string().nullable(), body: z.string() }),
  ),
})

/** A public api_v2 page as search indexes it. */
export type ApiV2SearchDocument = z.infer<typeof SearchDocument>

const SearchDocumentsBody = z.object({ documents: z.array(SearchDocument) })

const STALE_MS = 60_000

const siteCache = new QueryClient()

/** `path` from api_v2, cached; never throws. */
async function cachedList<T, U>(
  base: string | null,
  path: string,
  schema: z.ZodType<T>,
  pick: (body: T) => U[],
  fetchImpl: typeof fetch,
): Promise<U[]> {
  if (!base) return []

  const queryKey = [path, base]

  return siteCache.fetchQuery({
    queryKey,
    queryFn: async () => {
      const result = await readPublic(base, path, schema, fetchImpl)
      if (result.kind === 'ok') return pick(result.value)
      return siteCache.getQueryData<U[]>(queryKey) ?? []
    },
    staleTime: STALE_MS,
    // Keep the last good list however long api_v2 is down.
    gcTime: Infinity,
  })
}

/** `GET /catalog`: the url of every public page. */
export function fetchApiV2Catalog(
  base: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  return cachedList(
    base,
    '/catalog',
    CatalogBody,
    (body) => body.pages.map((page) => page.url),
    fetchImpl,
  )
}

/** `GET /search/documents`: every public page's search text. */
export function fetchApiV2SearchDocuments(
  base: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiV2SearchDocument[]> {
  return cachedList(
    base,
    '/search/documents',
    SearchDocumentsBody,
    (body) => body.documents,
    fetchImpl,
  )
}

/** Server function: the configured api_v2's public search documents. */
export const getApiV2SearchDocuments = createServerFn().handler(() =>
  fetchApiV2SearchDocuments(apiV2Base()),
)

const NO_DOCUMENTS: readonly ApiV2SearchDocument[] = []

/**
 * Search documents for a search caller on either side: none, without a call,
 * when api_v2 isn't configured, and none if the server function fails, so
 * search still answers from the static pages.
 */
export function loadApiV2SearchDocuments(): Promise<
  readonly ApiV2SearchDocument[]
> {
  if (!import.meta.env.VITE_API_V2_URL) return Promise.resolve(NO_DOCUMENTS)

  return getApiV2SearchDocuments().catch((error: unknown) => {
    console.warn('search documents read failed:', error)
    return NO_DOCUMENTS
  })
}
