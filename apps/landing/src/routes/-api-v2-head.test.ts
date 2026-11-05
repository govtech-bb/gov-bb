import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiV2PageModule from '../lib/api-v2-page'
import type * as CategoryApiModule from '../lib/api-v2-categories'
import { SITE_URL } from '../lib/site-url'
// Type-only, so it erases at runtime and the routes load after the mocks.
import type * as ContentRouteModule from './$'
import fixture from './-api-v2-head.fixture.json'

/**
 * The <head> landing writes for an api_v2 page (#3257): JSON-LD on a public
 * page, none on a preview page, and robots behaviour as for any other page.
 *
 * The real path from `GET /pages` to head tags: the fixture is the wire
 * response, read by `resolveApiV2Page` (schema parse and `fromApiV2`), then
 * `$`'s loader and `$`'s head. Only the server-function wrapper (and its
 * cache) is replaced, so no network is used.
 */

const BASE = 'http://api.example'

/** `GET /pages?url=` against the fixture: a page, or api_v2's 404. */
const fixtureFetch = vi.fn(async (input: string | URL | Request) => {
  const url = new URL(String(input)).searchParams.get('url')
  const page = Object.values(fixture).find((p) => p.url === url)
  return page
    ? new Response(JSON.stringify(page), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    : new Response(null, { status: 404 })
}) as unknown as typeof fetch

vi.mock('../lib/api-v2-page', async (importOriginal) => {
  const real = await importOriginal<typeof ApiV2PageModule>()
  return {
    ...real,
    getApiV2Page: async ({ data: url }: { data: string }) =>
      real.resolveApiV2Page(BASE, url, fixtureFetch),
  }
})

// The forms lists come from a server function; a page with no form needs
// none of them.
vi.mock('../lib/available-forms', () => ({
  getAvailableForms: async () => [],
  getMaintenanceForms: async () => [],
  getClosedForms: async () => [],
}))

// A page address is never a listed category, so no listing is read.
vi.mock('../lib/api-v2-categories', async (importOriginal) => ({
  ...(await importOriginal<typeof CategoryApiModule>()),
  getApiV2CategoryListing: vi.fn(async () => {
    throw new Error('no category listing expected')
  }),
}))

// api_v2 category mode, as landing runs when api_v2 is configured.
const TREE: CategoryApiModule.CategoryTreeResult = {
  kind: 'found',
  categories: [
    {
      slug: 'family-birth-relationships',
      url: '/family-birth-relationships',
      title: 'Family, birth and relationships',
      description: null,
      subcategories: [],
    },
  ],
}

type Head = {
  meta?: Array<Record<string, string>>
  links?: Array<Record<string, string>>
  scripts?: Array<{ type: string; children: string }>
}

let Route: typeof ContentRouteModule.Route

beforeAll(async () => {
  // The loader asks api_v2 only when it is configured (#3127).
  vi.stubEnv('VITE_API_V2_URL', BASE)
  ;({ Route } = await import('./$'))
}, 60_000)

beforeEach(() => {
  vi.stubEnv('VITE_API_V2_URL', BASE)
})

/** `$`'s head for the page api_v2 serves at `url`, as `level` sees it. */
async function headFor(url: string, level: 'public' | 'preview') {
  // SAFETY: `$`'s loader reads only `params._splat` and `context.{level,
  // serviceStatuses, categoryTree}`; its head reads only `loaderData`.
  const loaderData = await (Route.options.loader as (a: unknown) => unknown)({
    params: { _splat: url.slice(1) },
    context: { level, serviceStatuses: [], categoryTree: TREE },
  })
  expect(loaderData).toMatchObject({ kind: 'page', source: 'api_v2' })
  return (Route.options.head as (a: { loaderData: unknown }) => Head)({
    loaderData,
  })
}

const jsonLd = (head: Head) =>
  (head.scripts ?? [])
    .filter((s) => s.type === 'application/ld+json')
    .map((s) => JSON.parse(s.children) as Record<string, unknown>)

describe('JSON-LD on api_v2 pages (#3257)', () => {
  it('a public page has GovernmentService and BreadcrumbList', async () => {
    const page = fixture.public
    const ld = jsonLd(await headFor(page.url, 'public'))

    expect(ld.map((l) => l['@type'])).toEqual([
      'GovernmentService',
      'BreadcrumbList',
    ])
    expect(ld[0]).toMatchObject({
      name: page.frontmatter.title,
      description: page.frontmatter.description,
      url: `${SITE_URL}${page.url}`,
    })
    // api_v2's own trail, Home first.
    expect(ld[1].itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      ...page.breadcrumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: crumb.name,
        item: `${SITE_URL}${crumb.url}`,
      })),
    ])
  })

  it('a preview page has neither', async () => {
    const head = await headFor(fixture.preview.url, 'preview')
    expect(head.scripts).toBeUndefined()
    expect(jsonLd(head)).toEqual([])
  })
})

describe('robots on api_v2 pages (#3257)', () => {
  it('a public page is indexable: no robots meta, a canonical link', async () => {
    const page = fixture.public
    const head = await headFor(page.url, 'public')
    expect(head.meta).not.toContainEqual(
      expect.objectContaining({ name: 'robots' }),
    )
    expect(head.links).toEqual([
      { rel: 'canonical', href: `${SITE_URL}${page.url}` },
    ])
  })

  it('a preview page is noindex, with no canonical', async () => {
    const head = await headFor(fixture.preview.url, 'preview')
    expect(head.meta).toContainEqual({ name: 'robots', content: 'noindex' })
    expect(head.links).toBeUndefined()
  })

  it.each([
    ['false', 'User-agent: *\nDisallow: /\n'],
    ['true', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`],
  ])(
    'robots.txt follows VITE_ALLOW_INDEXING=%s with api_v2 configured',
    async (allow, body) => {
      vi.resetModules()
      vi.stubEnv('VITE_ALLOW_INDEXING', allow)
      // The flag is read when the route module loads.
      const { Route: RobotsRoute } = await import('./robots[.]txt')
      // SAFETY: the route declares a GET handler that takes no arguments.
      const handlers = RobotsRoute.options.server?.handlers as {
        GET: () => Response
      }
      const response = handlers.GET()
      expect(await response.text()).toBe(body)
    },
  )
})
