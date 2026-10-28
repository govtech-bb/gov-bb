import { createServerFn } from '@tanstack/react-start'
import { useRuntimeConfig } from 'nitro/runtime-config'
import type { ContentPage } from '../content/registry'
import { bakeStartLinkFormId } from '../utils/markdown/plugins'
import { createApiV2Cache, logFallback } from './api-v2-cache'
import type { Frontmatter } from './frontmatter'

/**
 * Pages from api_v2 (#2944). When `VITE_API_V2_URL` is set, the catch-all asks
 * api_v2 for a page first and falls back to the static markdown on any miss;
 * unset, landing serves static content only. Unlike the forms API, a missing
 * URL is not an error. A 301 is followed only to a same-site path.
 *
 * Contract for the #3140 smoke and #3364 metric filter. Every `$` page response
 * carries `x-content-source`: `api_v2` (served by api_v2, cached or not),
 * `static` (static markdown, api_v2 unset, skipped or answered "no page"), or
 * `static-fallback` (static markdown because api_v2 failed). A failure logs one
 * JSON line `{event: "api_v2_fallback", reason, url, status?, error?}` —
 * `console.error` for outages (`status`, `timeout`, `network`, and a breaker
 * trip as `circuit_open`), `console.warn` for bad content (`malformed`,
 * `no_target`, `bad_redirect`, `compile`).
 */

export const API_V2_TIMEOUT_MS = 750

/** Copied from apps/api_v2/src/store.ts (`PageResponse`) and schema.ts (`Frontmatter`). */
export interface PageResponse {
  url: string
  frontmatter: {
    lede?: string
    stage?: string
    featured?: boolean
    section?: string
    service_type?: string
    keywords?: Array<string>
    source_url?: string
    title: string
    description?: string
  }
  body_markdown: string
  /** The form a href-less Start link in the markdown opens. */
  form_id: string | null
  /** True when the `/start` sub-page is hidden from this viewer; the form's
   * own state still comes from the forms API. */
  hide_start_links: boolean
  breadcrumbs: Array<{ name: string; url: string }>
  /** When the page first went public; null until it has. */
  published_at: string | null
  /** The page's last save — also bumped by a visibility-only change, so not
   * used for "Last updated". */
  updated_at: string
}

/** A `ContentPage` that can cross the server-function boundary. */
export type SerializedContentPage = Omit<
  ContentPage,
  'Component' | 'selfRendered'
>

export type ApiV2Page = SerializedContentPage & { hideStartLinks: boolean }

/**
 * Why there is no api_v2 page. `not_found`, `rejected` (a 4xx),
 * `bad_redirect` and `compile` are answers (cached for their
 * `Cache-Control`); `no_target`, `status` (a 5xx),
 * `malformed`, `timeout` and `network` are api_v2 failures (never cached,
 * counted by the breaker in api-v2-cache.ts).
 */
export type ApiV2MissReason =
  | 'unconfigured'
  | 'skipped'
  | 'not_found'
  | 'rejected'
  | 'bad_redirect'
  | 'compile'
  | 'no_target'
  | 'status'
  | 'malformed'
  | 'timeout'
  | 'network'
  | 'circuit_open'

export type ApiV2Miss = {
  kind: 'miss'
  reason: ApiV2MissReason
  cacheControl?: string | null
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
function apiV2Base(): string | null {
  const config = useRuntimeConfig() as { apiV2Url?: string }
  return resolveApiV2Base(config.apiV2Url, process.env.VITE_API_V2_URL)
}

function isPageResponse(body: unknown): body is PageResponse {
  const page = body as PageResponse | null
  return (
    typeof page?.url === 'string' &&
    typeof page.frontmatter?.title === 'string' &&
    typeof page.body_markdown === 'string' &&
    typeof page.hide_start_links === 'boolean'
  )
}

/** `/…` only: not `//`, no backslash, no whitespace — the three ways a
 *  browser's URL parser turns a "path" into another origin (#3126). */
function isSitePath(to: string): boolean {
  return /^\/(?!\/)[^\\\s]*$/.test(to)
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

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
  | { kind: 'page'; body: PageResponse; cacheControl: string | null }
  | { kind: 'redirect'; to: string; cacheControl: string | null }
  | ApiV2Miss
> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_V2_TIMEOUT_MS)
  try {
    const response = await fetchImpl(
      `${base}/pages?url=${encodeURIComponent(url)}`,
      { redirect: 'manual', signal: controller.signal },
    )
    const cacheControl = response.headers.get('cache-control')
    if (response.status === 404) {
      // Release the socket: an unread body pins a keep-alive connection.
      await response.body?.cancel()
      return { kind: 'miss', reason: 'not_found', cacheControl }
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
      if (to && isSitePath(to)) return { kind: 'redirect', to, cacheControl }
      if (controller.signal.aborted)
        throw new Error('timed out reading the body')
      logFallback(
        'warn',
        to ? 'bad_redirect' : 'no_target',
        url,
        to ? { to } : {},
      )
      // A bad target is content, not an api_v2 failure: cache it, no breaker.
      return to
        ? { kind: 'miss', reason: 'bad_redirect', cacheControl }
        : { kind: 'miss', reason: 'no_target' }
    }
    if (response.status !== 200) {
      await response.body?.cancel()
      // A 4xx is api_v2 answering (e.g. a url over its 512-char limit), so a
      // visitor can't trip the breaker with junk urls; a 5xx is a failure.
      if (response.status < 500)
        return { kind: 'miss', reason: 'rejected', cacheControl }
      logFallback('error', 'status', url, { status: response.status })
      return { kind: 'miss', reason: 'status' }
    }
    const body: unknown = await response.json().catch(() => null)
    if (isPageResponse(body)) return { kind: 'page', body, cacheControl }
    if (controller.signal.aborted) throw new Error('timed out reading the body')
    logFallback('warn', 'malformed', url)
    return { kind: 'miss', reason: 'malformed' }
  } catch (error) {
    const reason = controller.signal.aborted ? 'timeout' : 'network'
    logFallback('error', reason, url, { error: message(error) })
    return { kind: 'miss', reason }
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
    categories: [segments[0]],
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
  }
}

export type ApiV2Result =
  | { kind: 'page'; page: ApiV2Page; cacheControl: string | null }
  | { kind: 'redirect'; to: string; cacheControl: string | null }
  | ApiV2Miss

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
  if (!base) return { kind: 'miss', reason: 'unconfigured' }
  const result = await fetchApiV2Page(base, url, fetchImpl)
  if (result.kind !== 'page') return result
  const { cacheControl } = result
  try {
    return { kind: 'page', page: await fromApiV2(result.body), cacheControl }
  } catch (error) {
    logFallback('warn', 'compile', url, { error: message(error) })
    return { kind: 'miss', reason: 'compile', cacheControl }
  }
}

export type ContentSource = 'api_v2' | 'static' | 'static-fallback'

/** The `x-content-source` value for an api_v2 result (see the top of file). */
export function contentSource(result: ApiV2Result): ContentSource {
  if (result.kind !== 'miss') return 'api_v2'
  return ['unconfigured', 'skipped', 'not_found', 'rejected'].includes(
    result.reason,
  )
    ? 'static'
    : 'static-fallback'
}

// Pure, so the client build (where the handler is stripped) drops the cache.
const apiV2Cache = /* @__PURE__ */ createApiV2Cache()

/** Server function: `resolveApiV2Page` against the configured api_v2, cached. */
export const getApiV2Page = createServerFn()
  .validator((url: string) => url)
  .handler(({ data: url }) =>
    apiV2Cache.get(url, () => resolveApiV2Page(apiV2Base(), url)),
  )
