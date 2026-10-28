import { createServerFn } from '@tanstack/react-start'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { z } from 'zod'
import type { ContentPage } from '../content/registry'
import { bakeStartLinkFormId } from '../utils/markdown/plugins'
import type { Frontmatter } from './frontmatter'

/**
 * Pages from api_v2 (#2944). When `VITE_API_V2_URL` is set, the catch-all asks
 * api_v2 for a page first and falls back to the static markdown on any miss;
 * unset, landing serves static content only. Unlike the forms API, a missing
 * URL is not an error. A 301 is followed only to a same-site path.
 */

export const API_V2_TIMEOUT_MS = 5_000

// Category slugs follow the editor's category contract (ADR 0078).
const PageCategorySlug = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

/** PublicPage from api_v2's modules/page-visibility.ts, with legacy taxonomy defaults. */
const PageResponse = z
  .object({
    url: z.string(),
    frontmatter: z.object({
      lede: z.string().optional(),
      stage: z.string().optional(),
      featured: z.boolean().optional(),
      section: z.string().optional(),
      service_type: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      source_url: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
    }),
    body_markdown: z.string(),
    /** The form a href-less Start link in the markdown opens. */
    form_id: z.string().nullable(),
    /** True when the start sub-page is hidden; form status comes from the forms API. */
    hide_start_links: z.boolean(),
    breadcrumbs: z.array(z.object({ name: z.string(), url: z.string() })),
    /** First publication, not the last save. */
    published_at: z.iso.datetime().nullable(),
    updated_at: z.iso.datetime(),
    // Older API deployments omit taxonomy fields; treat those pages as unfiled.
    category: PageCategorySlug.nullable().default(null),
    subcategory: PageCategorySlug.nullable().default(null),
  })
  .refine((page) => page.subcategory === null || page.category !== null, {
    message: 'A subcategory requires a top-level category',
    path: ['subcategory'],
  })

/** Parsed public page response, with omitted legacy taxonomy fields set to null. */
export type PageResponse = z.infer<typeof PageResponse>

/** A `ContentPage` that can cross the server-function boundary. */
export type SerializedContentPage = Omit<
  ContentPage,
  'Component' | 'selfRendered'
>

export type ApiV2Page = SerializedContentPage & {
  hideStartLinks: boolean
  /** api_v2's trail, current page last, Home not (ADR 0078). */
  breadcrumbs: PageResponse['breadcrumbs']
}

/** First non-empty source, trailing slashes trimmed; null when neither is set. */
export function resolveApiV2Base(
  configUrl?: string,
  envUrl?: string,
): string | null {
  const url = configUrl || envUrl
  return url ? url.replace(/\/+$/, '') : null
}

/** Same dual-source as `formsApiBase`: build-baked runtimeConfig, then process.env. */
export function apiV2Base(): string | null {
  const config = useRuntimeConfig() as { apiV2Url?: string }
  return resolveApiV2Base(config.apiV2Url, process.env.VITE_API_V2_URL)
}

/** `/…` only: not `//`, no backslash, no whitespace — the three ways a
 *  browser's URL parser turns a "path" into another origin (#3126). */
function isSitePath(to: string): boolean {
  return /^\/(?!\/)[^\\\s]*$/.test(to)
}

/**
 * `GET /pages?url=` without following redirects. A 404 is a silent miss;
 * anything else unexpected (status, network, timeout, bad body) is a logged
 * miss, so the caller falls back to static content.
 */
export async function fetchApiV2Page(
  base: string,
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { kind: 'page'; body: PageResponse }
  | { kind: 'redirect'; to: string }
  | { kind: 'miss' }
> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_V2_TIMEOUT_MS)
  try {
    const response = await fetchImpl(
      `${base}/pages?url=${encodeURIComponent(url)}`,
      { redirect: 'manual', signal: controller.signal },
    )
    if (response.status === 404) {
      // Release the socket: an unread body pins a keep-alive connection.
      await response.body?.cancel()
      return { kind: 'miss' }
    }
    if (response.status === 301) {
      const body = (await response.json().catch(() => null)) as {
        redirect?: unknown
      } | null
      const to =
        typeof body?.redirect === 'string'
          ? body.redirect
          : response.headers.get('Location')
      // Same-site paths only (#3126): a 301 here may come from a proxy, not
      // api_v2, and the browser caches it, so an off-site target would outlive
      // the misconfiguration that produced it.
      if (to && isSitePath(to)) return { kind: 'redirect', to }
      console.warn(`[api-v2] 301 for ${url} with no same-site target: ${to}`)
      return { kind: 'miss' }
    }
    if (response.status !== 200) {
      console.warn(`[api-v2] ${response.status} for ${url}`)
      await response.body?.cancel()
      return { kind: 'miss' }
    }
    const body: unknown = await response.json()
    const parsed = PageResponse.safeParse(body)
    if (parsed.success) return { kind: 'page', body: parsed.data }
    console.warn(`[api-v2] malformed page for ${url}`)
    return { kind: 'miss' }
  } catch (error) {
    console.warn(`[api-v2] request for ${url} failed:`, error)
    return { kind: 'miss' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Map an api_v2 page onto landing's `ContentPage`, compiling the markdown the
 * same way the build does.
 */
export async function fromApiV2(body: PageResponse): Promise<ApiV2Page> {
  const url = body.url.replace(/^\/+/, '')
  const segments = url.split('/')
  const leaf = segments[segments.length - 1]
  const slug = leaf === 'start' ? segments.slice(-2).join('/') : leaf
  const { stage, service_type, source_url, ...rest } = body.frontmatter
  const frontmatter: Frontmatter = {
    ...rest,
    ...(stage === 'alpha' && { stage }),
    ...((service_type === 'digital' || service_type === 'information') && {
      service_type,
    }),
    // Rendered as a link, and DB content is unreviewed: http(s) only.
    ...(source_url && /^https?:\/\//i.test(source_url) && { source_url }),
    categories: body.category ? [body.category] : [],
    ...(body.subcategory && { subcategory: body.subcategory }),
    visibility: 'public',
    ...(body.form_id && { form_id: body.form_id }),
    // "Last updated" is first publication, as in static frontmatter.
    ...(body.published_at && { publish_date: new Date(body.published_at) }),
  }
  // Dynamic so the parser stays out of the client entry: a static import
  // survives the server-fn split and ships ~340 KB of remark/rehype.
  const { processMarkdown } = await import('../utils/markdown')
  const { hast } = await processMarkdown(body.body_markdown)
  bakeStartLinkFormId(hast, body.form_id ?? undefined)
  return {
    slug,
    url,
    frontmatter,
    body: body.body_markdown,
    hast,
    hideStartLinks: body.hide_start_links,
    breadcrumbs: body.breadcrumbs,
  }
}

export type ApiV2Result =
  | { kind: 'page'; page: ApiV2Page }
  | { kind: 'redirect'; to: string }
  | { kind: 'miss' }

/**
 * The api_v2 page at `url`. A miss when api_v2 is unset, or when its markdown
 * fails to compile (an editor typo must not take the page down — the static
 * twin, if any, renders instead).
 */
export async function resolveApiV2Page(
  base: string | null,
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiV2Result> {
  if (!base) return { kind: 'miss' }
  const result = await fetchApiV2Page(base, url, fetchImpl)
  if (result.kind !== 'page') return result
  try {
    return { kind: 'page', page: await fromApiV2(result.body) }
  } catch (error) {
    console.warn(`[api-v2] compile failed for ${url}:`, error)
    return { kind: 'miss' }
  }
}

/** Server function: `resolveApiV2Page` against the configured api_v2. */
export const getApiV2Page = createServerFn()
  .validator((url: string) => url)
  .handler(({ data: url }) => resolveApiV2Page(apiV2Base(), url))
