import { createServerFn } from '@tanstack/react-start'
import { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { readPublic } from './api-v2-categories'
import { apiV2Base, landingToken } from './api-v2-page'
import { logFallback } from './api-v2-log'

/**
 * The site-wide lists api_v2 serves to the public (#3125): every page for the
 * sitemap and /services (#3244), and every page's text for search. With no preview token api_v2
 * lists public pages only, so drafts and previews never reach either.
 *
 * Each list is cached per server instance for a minute. A failed read serves
 * the last good list, or none on a cold start, and waits the same minute.
 * Each read also says how much of that minute is left (`freshForMs`), so the
 * browser holds a list no longer than the server does.
 */

/** Copied from apps/api_v2/src/modules/navigation.ts (`CatalogEntry`). */
const CatalogEntry = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  digital: z.boolean(),
  stage: z.string().nullable(),
})

/** A public api_v2 page as the catalog lists it. */
export type ApiV2CatalogEntry = z.infer<typeof CatalogEntry>

const CatalogBody = z.object({ pages: z.array(CatalogEntry) })

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

/** `path` from api_v2, cached, and how long it stays so; never throws. */
async function cachedList<T, U>(
  base: string | null,
  path: string,
  schema: z.ZodType<T>,
  pick: (body: T) => U[],
  fetchImpl: typeof fetch,
  token: string | undefined,
): Promise<{ list: U[]; freshForMs: number }> {
  if (!base) return { list: [], freshForMs: STALE_MS }

  const queryKey = [path, base]

  const list = await siteCache.fetchQuery({
    queryKey,
    queryFn: async () => {
      const result = await readPublic(base, path, schema, fetchImpl, token)
      if (result.kind === 'ok') return pick(result.value)
      // The route always exists; a 404 means api_v2 isn't serving it.
      if (result.kind === 'missing')
        logFallback('status', path, { status: 404 })
      return siteCache.getQueryData<U[]>(queryKey) ?? []
    },
    staleTime: STALE_MS,
    // Keep the last good list however long api_v2 is down.
    gcTime: Infinity,
  })
  const updatedAt = siteCache.getQueryState(queryKey)?.dataUpdatedAt ?? 0

  // Relative, so the browser's clock never has to agree with this one.
  return { list, freshForMs: Math.max(0, updatedAt + STALE_MS - Date.now()) }
}

/** `GET /catalog`: every public page. `token` is landing's rate-limit exemption (#3129). */
export function fetchApiV2CatalogEntries(
  base: string | null,
  fetchImpl: typeof fetch = fetch,
  token?: string,
): Promise<ApiV2CatalogEntry[]> {
  return cachedList(
    base,
    '/catalog',
    CatalogBody,
    (body) => body.pages,
    fetchImpl,
    token,
  ).then(({ list }) => list)
}

/** The url of every public page, from the same cached catalog read. */
export function fetchApiV2Catalog(
  base: string | null,
  fetchImpl: typeof fetch = fetch,
  token?: string,
): Promise<string[]> {
  return fetchApiV2CatalogEntries(base, fetchImpl, token).then((pages) =>
    pages.map((page) => page.url),
  )
}

/** Search documents, and how long the server's copy stays fresh. */
type SearchDocumentsRead = {
  documents: readonly ApiV2SearchDocument[]
  freshForMs: number
}

/** `GET /search/documents`: every public page's search text. `token` as for the catalog. */
export async function readApiV2SearchDocuments(
  base: string | null,
  fetchImpl: typeof fetch = fetch,
  token?: string,
): Promise<SearchDocumentsRead> {
  const { list, freshForMs } = await cachedList(
    base,
    '/search/documents',
    SearchDocumentsBody,
    (body) => body.documents,
    fetchImpl,
    token,
  )
  return { documents: list, freshForMs }
}

/** Server function: the configured api_v2's public search documents. */
export const getApiV2SearchDocuments = createServerFn().handler(() =>
  readApiV2SearchDocuments(apiV2Base(), fetch, landingToken()),
)

/** Server function: the configured api_v2's public catalog. */
export const getApiV2CatalogEntries = createServerFn().handler(() =>
  fetchApiV2CatalogEntries(apiV2Base(), fetch, landingToken()),
)

const NO_DOCUMENTS: readonly ApiV2SearchDocument[] = []

let loaded:
  | { until: number; documents: Promise<readonly ApiV2SearchDocument[]> }
  | undefined

/**
 * Search documents for a search caller on either side: none, without a call,
 * when api_v2 isn't configured, and none if the server function fails, so
 * search still answers from the static pages. In the browser one read is
 * shared until the server's copy expires, so the search index (rebuilt
 * when its documents change) isn't rebuilt on every search; the server has its
 * own cache behind the server function.
 */
export function loadApiV2SearchDocuments(
  read: () => Promise<SearchDocumentsRead> = () => getApiV2SearchDocuments(),
  now = Date.now(),
): Promise<readonly ApiV2SearchDocument[]> {
  if (!import.meta.env.VITE_API_V2_URL) return Promise.resolve(NO_DOCUMENTS)

  const safeRead = () =>
    read().catch((error: unknown) => {
      console.warn('search documents read failed:', error)
      return { documents: NO_DOCUMENTS, freshForMs: STALE_MS }
    })

  if (import.meta.env.SSR) return safeRead().then(({ documents }) => documents)
  if (!loaded || now >= loaded.until) {
    // Shared while in flight; then held as long as the server holds it.
    const entry = {
      until: Infinity,
      documents: safeRead().then(({ documents, freshForMs }) => {
        entry.until = now + freshForMs
        return documents
      }),
    }
    loaded = entry
  }

  return loaded.documents
}
