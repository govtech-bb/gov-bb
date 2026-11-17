import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { z } from 'zod'
import { isSitePath } from '@govtech-bb/govbbmarkd/content-url'
import type { ContentPage } from '../content/registry'
import { bakeStartLinkFormId } from '../utils/markdown/plugins'
import { createApiV2Cache } from './api-v2-cache'
import { REASONS, logFallback, message } from './api-v2-log'
import { apiV2Breaker, readApiV2 } from './api-v2-reader'
import { createVersionWatch, fetchSiteVersion } from './api-v2-version'
import type { Frontmatter, ViewLevel } from './frontmatter'
import { COOKIE_NAME, levelFromCookie } from './preview'

/**
 * Pages from api_v2 (#2944). When `VITE_API_V2_URL` is set, the catch-all asks
 * api_v2 for a page first and falls back to the static markdown on any miss;
 * unset, landing serves static content only. Unlike the forms API, a missing
 * URL is not an error. A 301 is followed only to a same-site path.
 *
 * Contract for the #3140 smoke and #3364 metric filter. Every `$` response
 * that renders a page carries `x-content-source` (redirects and 404s do not):
 * `api_v2` (served by api_v2, fresh or within stale-while-revalidate),
 * `api_v2-stale` (a kept api_v2 copy, because api_v2 failed or the breaker is
 * open), `static` (static markdown, api_v2 unset, skipped or answered "no
 * page"), or `static-fallback` (static markdown because api_v2 failed or sent
 * bad content). Category listings send `api_v2` when api_v2 lists them
 * (ADR 0132) and `static` otherwise. Each failed fetch logs one JSON line
 * `{event: "api_v2_fallback", reason, url, status?, error?}`, whichever header
 * follows (but the site-version check logs nothing: api-v2-version.ts)
 * — `console.error` for api_v2 failures (`status`, `timeout`, `network`,
 * `malformed`, `no_target`: these count toward the breaker) and for
 * `preview_token` (a reviewer's read refused with 401: landing's and api_v2's
 * PREVIEW_SECRET differ), `console.warn`
 * for answers landing can't use (`rejected` — a 4xx other than 404, 408 and
 * 429, or for a page another 2xx or a 3xx other than 301 — `bad_redirect`,
 * `compile`). A 404 isn't logged. A breaker trip logs one
 * `{event: "api_v2_circuit_open", url}` at `console.error`; requests it turns
 * away aren't logged. Category, site-list and collection reads
 * (api-v2-categories.ts, api-v2-site.ts, api-v2-collections.ts) log the same
 * lines and count toward the same breaker (api-v2-reader.ts), with the api_v2
 * path as `url`. A 4xx other than 404, 408 and 429 is `rejected` for them too,
 * so a visitor's bad collection key can't open the breaker; any other status
 * but 200 and 404 is `status`, as is a 404 from `/categories`, `/catalog` or
 * `/search/documents`. `REASONS` in api-v2-log.ts holds the classification.
 */

/** An optional field that is dropped, not fatal, when it has the wrong type. */
const lenient = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined)

const BARBADOS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Barbados',
})

/**
 * `publish_date` is a calendar day held as UTC midnight, as frontmatter dates
 * are. A date imported from markdown, and a backfilled row that copies it,
 * already is one and keeps its day. Any other value is the instant an editor
 * saved, so it becomes its day in Barbados: an edit at 10 p.m. on 29 October
 * is dated the 29th, not the UTC 30th.
 */
function barbadosDay(iso: string): Date {
  const instant = new Date(iso)
  if (instant.getTime() % 86_400_000 === 0) return instant
  return new Date(BARBADOS_DAY.format(instant))
}

/**
 * PublicPage from api_v2's modules/page-visibility.ts. Only `url`, the title,
 * `body_markdown`, `hide_start_links` and `breadcrumbs` can reject a page;
 * every other field falls back on its own, so a field landing doesn't need
 * never takes a page down.
 */
const PageResponse = z
  .object({
    url: z.string(),
    frontmatter: z
      .object({
        lede: lenient(z.string()),
        stage: lenient(z.string()),
        service_type: lenient(z.string()),
        keywords: lenient(z.array(z.string())),
        source_url: lenient(z.string()),
        title: z.string(),
        description: lenient(z.string()),
      })
      // Keys api_v2 adds later pass through, as the old `...rest` did.
      .loose(),
    body_markdown: z.string(),
    /** The form a href-less Start link in the markdown opens. */
    form_id: z.string().nullable().catch(null),
    /** True when the page has start sub-pages and none is visible; form status comes from the forms API. */
    hide_start_links: z.boolean(),
    breadcrumbs: z.array(z.object({ name: z.string(), url: z.string() })),
    /** First publication, not the last save. */
    published_at: z.iso.datetime({ offset: true }).nullable().catch(null),
    /** The last content change (#3105); absent from an API older than it. */
    content_updated_at: lenient(z.iso.datetime({ offset: true })),
    /** The last save; landing doesn't read it. */
    updated_at: lenient(z.iso.datetime({ offset: true })),
    // The API owns slug syntax and taxonomy relationships. Absent (an API
    // older than #3133) is not null (unfiled): `fromApiV2` falls back to the
    // url for absent.
    category: lenient(z.string().nullable()),
    subcategory: z.string().nullable().catch(null).optional(),
    /** Who may see the page (#3246); absent from an API older than it. */
    visibility: lenient(z.enum(['public', 'preview'])),
  })
  .refine((page) => page.subcategory == null || page.category != null, {
    message: 'a subcategory needs its category',
  })

/** A parsed public page response; `category` is undefined from an older API. */
export type PageResponse = z.infer<typeof PageResponse>

/** A `ContentPage` that can cross the server-function boundary. */
export type SerializedContentPage = Omit<
  ContentPage,
  'Component' | 'selfRendered'
>

export type ApiV2Page = SerializedContentPage & {
  hideStartLinks: boolean
  /** api_v2's trail, current page last, Home not (ADR 0132). */
  breadcrumbs: PageResponse['breadcrumbs']
}

/**
 * Why there is no api_v2 page. `not_found`, `rejected` (a 4xx other than 404,
 * 408 and 429, or another 2xx or 3xx), `bad_redirect` and `compile` are
 * answers (cached for their `Cache-Control`); `no_target`, `status` (a 5xx,
 * 408 or 429),
 * `malformed`, `timeout` and `network` are api_v2 failures (never cached,
 * counted by the breaker in api-v2-reader.ts). See `REASONS` in api-v2-log.ts.
 */
export type ApiV2MissReason =
  | 'unconfigured'
  | 'skipped'
  | 'not_found'
  | 'rejected'
  | 'bad_redirect'
  | 'compile'
  | 'preview_token'
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
export function apiV2Base(): string | null {
  const config = useRuntimeConfig() as { apiV2Url?: string }
  return resolveApiV2Base(config.apiV2Url, process.env.VITE_API_V2_URL)
}

/** api_v2's LANDING_SECRET, which exempts landing from its rate limit (#3129). Server-only. */
export function landingToken(): string | undefined {
  const config = useRuntimeConfig() as { landingSecret?: string }
  return config.landingSecret || process.env.LANDING_SECRET || undefined
}

/**
 * The `x-preview-token` for a read at `level` (#2961): the site's
 * PREVIEW_SECRET for a reviewer, nothing for the public. No secret configured
 * means no token, so a reviewer then sees what the public sees.
 */
export function previewTokenFor(
  level: ViewLevel,
  secret: string | undefined,
): string | undefined {
  return level === 'preview' ? secret || undefined : undefined
}

/** Same dual-source as `checkFormAccessible`. Server-only. */
function previewSecret(): string | undefined {
  const config = useRuntimeConfig() as { previewSecret?: string }
  return config.previewSecret || process.env.PREVIEW_SECRET || undefined
}

/** A 301 from api_v2: a same-site redirect, or why it can't be followed. */
type RedirectRead =
  | { kind: 'redirect'; to: string; cacheControl: string | null }
  | ApiV2Miss

/**
 * `GET /pages?url=` through the reader, without following redirects. A 404 is
 * a silent miss; anything else unexpected (status, network, timeout, bad body)
 * is a logged miss, so the caller falls back to static content. A 301 and a
 * reviewer's 401 are read here. `previewToken` makes it a reviewer's read; a
 * 401 to one is a `preview_token` miss.
 */
export async function fetchApiV2Page(
  base: string,
  url: string,
  fetchImpl: typeof fetch = fetch,
  landingToken?: string,
  previewToken?: string,
): Promise<
  | { kind: 'page'; body: PageResponse; cacheControl: string | null }
  | RedirectRead
> {
  // A url that can't be encoded (a lone surrogate) is the visitor's, not an
  // api_v2 failure, so it must not throw out of the read.
  let query: string
  try {
    query = encodeURIComponent(url)
  } catch {
    logFallback('rejected', url)
    return { kind: 'miss', reason: 'rejected', cacheControl: null }
  }
  const result = await readApiV2(
    base,
    `/pages?url=${query}`,
    PageResponse,
    fetchImpl,
    {
      landingToken,
      previewToken,
      logUrl: url,
      redirect: 'manual',
      answer: async (response, signal): Promise<RedirectRead | undefined> => {
        if (response.status === 301) return readRedirect(url, response, signal)
        if (response.status === 401 && previewToken) {
          await response.body?.cancel()
          logFallback('preview_token', url, { status: response.status })
          return { kind: 'miss', reason: 'preview_token' }
        }
        // Another 2xx or 3xx (a redirect it doesn't follow) stays `rejected`,
        // as pages have always classed it. The reader's rule would count it
        // as an api_v2 failure, which moving the transport must not change.
        if (response.status !== 200 && response.status < 400) {
          await response.body?.cancel()
          logFallback('rejected', url, { status: response.status })
          const cacheControl = response.headers.get('cache-control')
          return { kind: 'miss', reason: 'rejected', cacheControl }
        }
      },
    },
  )
  if (result.kind !== 'ok') return result
  return { kind: 'page', body: result.value, cacheControl: result.cacheControl }
}

/** A 301's target, from its body or its Location header. */
async function readRedirect(
  url: string,
  response: Response,
  signal: AbortSignal,
): Promise<RedirectRead> {
  const cacheControl = response.headers.get('cache-control')
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
  if (signal.aborted) throw new Error('timed out reading the body')
  logFallback(to ? 'bad_redirect' : 'no_target', url, to ? { to } : {})
  // An off-site target is content: cached, no breaker. No target at all
  // is an api_v2 failure.
  return to
    ? { kind: 'miss', reason: 'bad_redirect', cacheControl }
    : { kind: 'miss', reason: 'no_target' }
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
    // An older API sends no category: file the page under its first segment.
    categories:
      body.category === undefined
        ? [segments[0]]
        : body.category
          ? [body.category]
          : [],
    ...(body.subcategory && { subcategory: body.subcategory }),
    visibility: body.visibility ?? 'public',
    ...(body.form_id && { form_id: body.form_id }),
    // "Last updated" is the last content change (#3105), shown once the page
    // has a publication date; an older API sends only first publication.
    ...(body.published_at && {
      publish_date: barbadosDay(body.content_updated_at ?? body.published_at),
    }),
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
  | {
      kind: 'page'
      page: ApiV2Page
      cacheControl: string | null
      /** Kept by the cache after a failure (api-v2-cache.ts). */
      stale?: true
    }
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
  landingToken?: string,
  previewToken?: string,
): Promise<ApiV2Result> {
  if (!base) return { kind: 'miss', reason: 'unconfigured' }
  const result = await fetchApiV2Page(
    base,
    url,
    fetchImpl,
    landingToken,
    previewToken,
  )
  if (result.kind !== 'page') return result
  const { cacheControl } = result
  try {
    return { kind: 'page', page: await fromApiV2(result.body), cacheControl }
  } catch (error) {
    logFallback('compile', url, { error: message(error) })
    return { kind: 'miss', reason: 'compile', cacheControl }
  }
}

export type ContentSource =
  | 'api_v2'
  | 'api_v2-stale'
  | 'static'
  | 'static-fallback'

/** The `x-content-source` value for an api_v2 result (see the top of file). */
export function contentSource(result: ApiV2Result): ContentSource {
  if (result.kind === 'miss') return REASONS[result.reason].source
  return result.kind === 'page' && result.stale ? 'api_v2-stale' : 'api_v2'
}

// Pure, so the client build (where the handler is stripped) drops the cache.
const apiV2Cache = /* @__PURE__ */ createApiV2Cache(apiV2Breaker)
let siteChanges = 0
const checkSiteVersion = /* @__PURE__ */ createVersionWatch(
  () => fetchSiteVersion(apiV2Base(), fetch, landingToken()),
  () => {
    siteChanges++
    apiV2Cache.expire()
  },
)

/** Checks api_v2's site version, then resolves to how many times this
 *  instance has seen it move, for a cache besides the page cache to expire on. */
export async function siteVersionChanges(): Promise<number> {
  await checkSiteVersion()
  return siteChanges
}

/** A lone surrogate: a paired one is part of an astral code point under `u`. */
const LONE_SURROGATE = /\p{Cs}/u

/** A url api_v2 could hold a page at: a well-formed site path within its
 *  512-character limit. */
function isPageUrl(url: string): boolean {
  return url.length <= 512 && !LONE_SURROGATE.test(url) && isSitePath(url)
}

/**
 * A public read goes through `cache`; a reviewer's read (with a preview token)
 * skips it both ways, because the cache is keyed by url alone and a preview
 * page must never be served to the public. Reviewer reads bypass the circuit
 * breaker and the kept stale copy too: they don't trip it, and while it is
 * open they still wait up to `API_V2_TIMEOUT_MS` before falling back.
 */
export function loadApiV2Page(
  cache: ReturnType<typeof createApiV2Cache>,
  base: string | null,
  url: string,
  landingToken?: string,
  previewToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiV2Result> {
  if (previewToken)
    return resolveApiV2Page(base, url, fetchImpl, landingToken, previewToken)
  return cache.get(url, () =>
    resolveApiV2Page(base, url, fetchImpl, landingToken),
  )
}

/**
 * `getApiV2Page`'s handler: `loadApiV2Page` against the configured api_v2,
 * cached until it expires or api_v2's site version moves. The level comes
 * from the httpOnly grant cookie, read here, never from the client. Exported
 * for its test, which can't call a server function outside Start's runtime;
 * server-only, so the client build drops it and what it reaches (the cookie,
 * the tokens) as it does a handler body.
 */
export const readApiV2Page = createServerOnlyFn(
  async (url: string): Promise<ApiV2Result> => {
    // A visitor's path no page could have is a miss, not an error, and it
    // makes no api_v2 request: not the version check, the page read, the
    // cache or the breaker.
    if (!isPageUrl(url)) {
      logFallback('rejected', url)
      return { kind: 'miss', reason: 'rejected' }
    }
    await checkSiteVersion()
    const level = levelFromCookie(getCookie(COOKIE_NAME))
    return loadApiV2Page(
      apiV2Cache,
      apiV2Base(),
      url,
      landingToken(),
      previewTokenFor(level, previewSecret()),
    )
  },
)

/** Server function: `readApiV2Page`. A malformed string is the visitor's
 *  path, so it reaches the handler and misses; anything else is refused. */
export const getApiV2Page = createServerFn()
  .validator(z.string())
  .handler(({ data: url }) => readApiV2Page(url))
