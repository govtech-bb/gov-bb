import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Breadcrumbs } from '../components/Breadcrumbs'
import type { Crumb } from '../lib/breadcrumb-trail'
import type * as ApiV2PageModule from '../lib/api-v2-page'
import type * as CategoryApiModule from '../lib/api-v2-categories'
import type * as ContentRouteModule from './$'
import fixture from './-api-v2-head.fixture.json'

const pageResponse = vi.hoisted(() => vi.fn())

vi.mock('../lib/api-v2-page', async (importOriginal) => {
  const real = await importOriginal<typeof ApiV2PageModule>()
  return {
    ...real,
    getApiV2Page: async ({ data: url }: { data: string }) =>
      real.resolveApiV2Page('http://api.test', url, async () =>
        Response.json(pageResponse()),
      ),
  }
})
vi.mock('../lib/available-forms', () => ({
  getAvailableForms: async () => [],
  getMaintenanceForms: async () => [],
  getClosedForms: async () => [],
}))
vi.mock('../lib/api-v2-categories', async (importOriginal) => ({
  ...(await importOriginal<typeof CategoryApiModule>()),
  getApiV2CategoryListing: vi.fn(async () => {
    throw new Error('No category listing expected')
  }),
}))

let Route: typeof ContentRouteModule.Route
beforeAll(async () => {
  ;({ Route } = await import('./$'))
}, 60_000)
afterEach(() => vi.unstubAllEnvs())

describe('api_v2 page URL safety', () => {
  it.each([
    ['/guidance/parent', '/guidance/parent'],
    ['//outside.test/parent', '/outside.test/parent'],
    ['/\\outside.test/parent', '/'],
    ['/\t/outside.test/parent', '/'],
  ])(
    'renders an on-site breadcrumb from stored URL %j',
    async (url, expected) => {
      vi.stubEnv('VITE_API_V2_URL', 'http://api.test')
      const page = fixture.public
      pageResponse.mockReturnValue({
        ...page,
        breadcrumbs: [
          { name: 'Parent', url },
          { name: page.frontmatter.title, url: page.url },
        ],
      })

      // The loader only reads these params/context fields for an API page.
      const load = Route.options.loader as (args: unknown) => Promise<{
        kind: string
        breadcrumbs: Crumb[]
      }>
      const loaded = await load({
        params: { _splat: page.url.slice(1) },
        context: {
          level: 'public',
          serviceStatuses: [],
          categoryTree: { kind: 'found', categories: [] },
        },
      })
      expect(loaded.kind).toBe('page')

      const router = createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory({ initialEntries: [page.url] }),
      })
      const html = renderToStaticMarkup(
        <RouterContextProvider router={router}>
          <Breadcrumbs pathname={page.url} trail={loaded.breadcrumbs} />
        </RouterContextProvider>,
      )
      const dom = new JSDOM(html, { url: `https://site.test${page.url}` })
      try {
        const links = [...dom.window.document.querySelectorAll('a')]
        const parent = links.find((link) => link.textContent === 'Parent')
        expect(links).toHaveLength(2)
        for (const link of links) {
          expect(new URL(link.href).origin).toBe('https://site.test')
        }
        expect(parent?.getAttribute('href')).toBe(expected)
      } finally {
        dom.window.close()
      }
    },
  )
})
