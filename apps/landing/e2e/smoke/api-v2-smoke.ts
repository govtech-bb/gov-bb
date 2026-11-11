/**
 * Pure logic for the post-deploy smoke of landing served from api_v2
 * (#3140, #3143, #3144). No browser here, so api-v2-smoke.test.ts covers it
 * in the normal vitest run; the Playwright specs beside it drive the live
 * preview.
 *
 * The pages under test come from api_v2 itself at run time: `GET /catalog`
 * (every public page except `/start` steps) plus each page its start links
 * point to. A fixed list would go stale as editors add and retire pages, and
 * `PINNED_PAGES` keeps a floor so an emptied catalog can't pass by checking
 * nothing.
 */

export interface SmokeEnv {
  /** Landing origin under test, e.g. the `v2-rewrite` Amplify preview. */
  landing: string
  /** The api_v2 that landing reads. */
  apiV2: string
  /** The forms origin landing's Start links open. */
  forms: string
  /** The forms API landing reads form availability from (VITE_FORMS_API_URL). */
  formsApi: string
}

function origin(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`${name} is required (no default)`)
  return new URL(value.trim()).origin
}

export function readSmokeEnv(
  env: Record<string, string | undefined>,
): SmokeEnv {
  return {
    landing: origin('SMOKE_LANDING_URL', env.SMOKE_LANDING_URL),
    apiV2: origin('SMOKE_API_V2_URL', env.SMOKE_API_V2_URL),
    forms: origin('SMOKE_FORMS_URL', env.SMOKE_FORMS_URL),
    formsApi: origin('SMOKE_FORMS_API_URL', env.SMOKE_FORMS_API_URL),
  }
}

/**
 * Checked on every run whatever the catalog says. Both are long-lived service
 * pages; register-a-birth is also the page api_v2's own deploy smoke pins.
 */
export const PINNED_PAGES = [
  '/family-birth-relationships/register-a-birth',
  '/family-birth-relationships/get-birth-certificate',
]

/** The fields of api_v2's PublicPage the smoke reads. */
export interface ApiV2Page {
  url: string
  form_id: string | null
  hide_start_links: boolean
  body_markdown: string
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Every catalog page URL. Throws on a failed or empty catalog. With api_v2's
 * preview token the catalog also lists preview pages.
 */
export async function fetchCatalogUrls(
  apiV2: string,
  fetchImpl: Fetch = fetch,
  previewToken?: string,
): Promise<string[]> {
  const response = await fetchImpl(
    `${apiV2}/catalog`,
    previewToken ? { headers: { 'x-preview-token': previewToken } } : undefined,
  )
  if (!response.ok) throw new Error(`GET /catalog returned ${response.status}`)
  const body = (await response.json()) as { pages?: unknown }
  if (!Array.isArray(body.pages))
    throw new Error('GET /catalog: no pages array')
  const urls = body.pages.map((page: { url?: unknown }) => page.url)
  if (!urls.every((url): url is string => typeof url === 'string'))
    throw new Error('GET /catalog: a page has no url')
  if (urls.length === 0) throw new Error('GET /catalog listed no pages')
  return urls
}

/** The pages #3140 checks: the pinned floor plus the catalog. */
export async function pagesToCheck(
  apiV2: string,
  fetchImpl: Fetch = fetch,
): Promise<string[]> {
  const catalog = await fetchCatalogUrls(apiV2, fetchImpl)
  return [...new Set([...PINNED_PAGES, ...catalog])]
}

/** One api_v2 page, or null when api_v2 has none at that URL (404). */
export async function fetchPage(
  apiV2: string,
  url: string,
  fetchImpl: Fetch = fetch,
): Promise<ApiV2Page | null> {
  const response = await fetchImpl(
    `${apiV2}/pages?url=${encodeURIComponent(url)}`,
  )
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`GET /pages?url=${url} returned ${response.status}`)
  const page = (await response.json()) as Partial<ApiV2Page>
  if (
    typeof page.url !== 'string' ||
    typeof page.body_markdown !== 'string' ||
    (page.form_id !== null && typeof page.form_id !== 'string')
  )
    throw new Error(`GET /pages?url=${url}: unexpected page shape`)
  return {
    url: page.url,
    form_id: page.form_id,
    hide_start_links: page.hide_start_links === true,
    body_markdown: page.body_markdown,
  }
}

/**
 * Why a landing response does not prove the page came from api_v2, or null
 * when it does. Only a fresh `api_v2` passes: `api_v2-stale` means api_v2
 * failed and landing served a kept copy, and `static`/`static-fallback` (or no
 * header) mean api_v2 wasn't used at all (contract in src/lib/api-v2-page.ts).
 */
export function contentSourceProblem(
  status: number,
  contentSource: string | null | undefined,
): string | null {
  if (status !== 200) return `HTTP ${status}`
  if (!contentSource) return 'no x-content-source header'
  if (contentSource !== 'api_v2') return `x-content-source: ${contentSource}`
  return null
}

/** A `<a data-start-link …>` in a page body: its href and data-form-id, if any. */
interface StartLink {
  href?: string
  formId?: string
}

const START_LINK = /<a\b[^>]*\bdata-start-link\b[^>]*>/gi
// Leading whitespace so `href` never matches `data-href`.
const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)
// Text landing never renders as links: HTML comments and fenced code.
const UNRENDERED = /<!--[\s\S]*?-->|^(```|~~~)[\s\S]*?^\1/gm

export function startLinks(markdown: string): StartLink[] {
  const rendered = markdown.replace(UNRENDERED, '')
  return [...rendered.matchAll(START_LINK)].map(([tag]) => {
    const href = attr(tag, 'href')
    const formId = attr(tag, 'data-form-id')
    return {
      ...(href && { href: href[1] ?? href[2] }),
      ...(formId && { formId: formId[1] ?? formId[2] }),
    }
  })
}

/**
 * How a citizen gets from a catalog page to its form: the landing pages to
 * click through (`path[0]` is the catalog page) and the form the last page's
 * Start link must open, with each page's own `form_id` (whose maintenance or
 * closed banner landing shows). `problem` instead when the page can never
 * open its form: a start link with no target and no `form_id` to bake into it.
 */
export type StartChain =
  | { path: string[]; pageFormIds: (string | null)[]; formId: string }
  | { path: string[]; problem: string }

const MAX_HOPS = 3

/**
 * Follows the first start link of `url` through same-site pages (usually the
 * `/start` step) until one has no href. As in StartLink.tsx, an authored href
 * wins, then an authored `data-form-id`, then the page's `form_id`
 * (bakeStartLinkFormId). Null when the page has no start link, hides
 * them, or (for a page with no `form_id`) its link leads somewhere that isn't
 * an api_v2 page, such as an interactive tool's `/find` or `/form` — none of
 * those open a form.
 */
export function startChain(
  url: string,
  pages: ReadonlyMap<string, ApiV2Page | null>,
): StartChain | null {
  const path: string[] = []
  const pageFormIds: (string | null)[] = []
  let current = pages.get(url)
  while (current) {
    path.push(current.url)
    pageFormIds.push(current.form_id)
    if (current.hide_start_links) return null
    const [link] = startLinks(current.body_markdown)
    if (!link) return null
    if (link.href === undefined) {
      const formId = link.formId ?? current.form_id
      if (formId) return { path, pageFormIds, formId }
      return {
        path,
        problem: `${current.url} has a start link but no form_id`,
      }
    }
    // An authored link straight off-site isn't bound to form_id.
    if (!link.href.startsWith('/') || link.href.startsWith('//')) return null
    if (path.length > MAX_HOPS || path.includes(link.href)) {
      return { path, problem: `start links from ${url} loop or run too deep` }
    }
    const next = pages.get(link.href)
    // A page bound to a form whose link leads off api_v2 can't open it.
    if (!next && current.form_id)
      return {
        path,
        problem: `${current.url} links ${link.href}, which api_v2 does not serve`,
      }
    current = next
  }
  return null
}

/**
 * Every catalog page's start chain, fetching the pages its links lead to.
 * Pages with no chain are left out.
 */
export async function startChains(
  apiV2: string,
  fetchImpl: Fetch = fetch,
): Promise<StartChain[]> {
  const catalog = await fetchCatalogUrls(apiV2, fetchImpl)
  const pages = new Map<string, ApiV2Page | null>()
  const load = async (url: string): Promise<void> => {
    if (pages.has(url)) return
    const page = await fetchPage(apiV2, url, fetchImpl)
    pages.set(url, page)
    for (const link of page ? startLinks(page.body_markdown) : []) {
      if (link.href?.startsWith('/') && !link.href.startsWith('//'))
        await load(link.href)
    }
  }
  for (const url of catalog) await load(url)
  return catalog
    .map((url) => startChain(url, pages))
    .filter((chain): chain is StartChain => chain !== null)
}

/** Landing's notices for a form citizens can't start right now ($.tsx). */
export const UNAVAILABLE_NOTICES = [
  'This form is currently being upgraded to serve you better.',
  'Applications for this service have closed.',
]

/**
 * The catalog pages only a preview-token holder sees (#3143). Throws when
 * either read fails, so a wrong token (401) fails rather than finding none.
 */
export async function previewPageUrls(
  apiV2: string,
  token: string,
  fetchImpl: Fetch = fetch,
): Promise<string[]> {
  const all = await fetchCatalogUrls(apiV2, fetchImpl, token)
  const anonymous = new Set(await fetchCatalogUrls(apiV2, fetchImpl))
  return all.filter((url) => !anonymous.has(url))
}

/** The forms whose pages landing gates (#3143), by the notice it shows. */
export interface GatedForms {
  /** `/form-definitions/maintenance`: the upgrade notice. */
  maintenance: Set<string>
  /** `form_disabled` service statuses not under maintenance: the same notice. */
  statusDisabled: Set<string>
  /** `/form-definitions/closed`: the closed notice. */
  closed: Set<string>
}

/** Canonical form IDs are kebab-case (ADR-0048), as available-forms.ts checks. */
const FORM_ID = /^[a-z0-9][a-z0-9-]*$/
const SERVICE_STATUSES = new Set(['enabled', 'form_disabled', 'disabled'])

/** The `data` of a forms API `{status:"success", data:[...]}` response. */
async function readFormsApiList(
  formsApi: string,
  path: string,
  fetchImpl: Fetch,
): Promise<unknown[]> {
  const response = await fetchImpl(`${formsApi}${path}`)
  if (!response.ok) throw new Error(`GET ${path} returned ${response.status}`)
  const body = (await response.json()) as { status?: unknown; data?: unknown }
  if (body?.status !== 'success' || !Array.isArray(body.data))
    throw new Error(`GET ${path}: unexpected response shape`)
  return body.data
}

async function readFormIds(
  formsApi: string,
  path: string,
  fetchImpl: Fetch,
): Promise<Set<string>> {
  const ids = await readFormsApiList(formsApi, path, fetchImpl)
  if (
    !ids.every((id): id is string => typeof id === 'string' && FORM_ID.test(id))
  )
    throw new Error(`GET ${path}: a form ID failed validation`)
  return new Set(ids)
}

/**
 * The gated form IDs, read from the forms API landing reads (validated as
 * available-forms.ts and service-status.ts do). Throws on a failed or odd read.
 */
export async function gatedForms(
  formsApi: string,
  fetchImpl: Fetch = fetch,
): Promise<GatedForms> {
  const maintenance = await readFormIds(
    formsApi,
    '/form-definitions/maintenance',
    fetchImpl,
  )
  const closed = await readFormIds(
    formsApi,
    '/form-definitions/closed',
    fetchImpl,
  )
  const statuses = (await readFormsApiList(
    formsApi,
    '/service_status',
    fetchImpl,
  )) as { slug?: unknown; status?: unknown }[]
  if (
    !statuses.every(
      (entry) =>
        typeof entry?.slug === 'string' &&
        entry.slug.length > 0 &&
        typeof entry.status === 'string' &&
        SERVICE_STATUSES.has(entry.status),
    )
  )
    throw new Error('GET /service_status: a status failed validation')
  const statusDisabled = new Set(
    statuses
      .filter((entry) => entry.status === 'form_disabled')
      .map((entry) => entry.slug as string)
      .filter((slug) => !maintenance.has(slug)),
  )
  return { maintenance, statusDisabled, closed }
}

/** An api_v2 page landing must gate. A url ending `/start` is a start step. */
export interface GatedPage {
  url: string
  formId: string
}

/**
 * Every catalog page, and the `/start` step beside it when api_v2 serves one,
 * filed under each gated state its OWN `form_id` is in: landing gates a page
 * by its own form, not the one its links lead to.
 */
export async function gatedPages(
  apiV2: string,
  gated: GatedForms,
  fetchImpl: Fetch = fetch,
): Promise<Record<keyof GatedForms, GatedPage[]>> {
  const result: Record<keyof GatedForms, GatedPage[]> = {
    maintenance: [],
    statusDisabled: [],
    closed: [],
  }
  for (const url of await fetchCatalogUrls(apiV2, fetchImpl)) {
    for (const candidate of [url, `${url}/start`]) {
      const page = await fetchPage(apiV2, candidate, fetchImpl)
      if (!page?.form_id) continue
      for (const state of Object.keys(result) as (keyof GatedForms)[]) {
        if (gated[state].has(page.form_id))
          result[state].push({ url: candidate, formId: page.form_id })
      }
    }
  }
  return result
}
