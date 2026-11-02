import { createElement } from 'react'
import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ServicesRouteModule from './services'

const siteMocks = vi.hoisted(() => ({
  getApiV2CatalogEntries: vi.fn(),
}))
vi.mock('../lib/api-v2-site', () => siteMocks)
// Both read the router; the page body is what's under test.
vi.mock('../components/ServiceSearch', () => ({ ServiceSearch: () => null }))
vi.mock('../components/HelpfulBox', () => ({ HelpfulBox: () => null }))

const entry = (url: string, digital: boolean, stage: string | null) => ({
  url,
  title: url,
  description: null,
  digital,
  stage,
})

// Load the route once; the content graph is slow to transform on CI.
let Route: typeof ServicesRouteModule.Route
beforeAll(async () => {
  ;({ Route } = await import('./services'))
}, 60_000)

beforeEach(() => {
  vi.clearAllMocks()
})

const load = (categoryTree: unknown) =>
  (Route.options.loader as (a: unknown) => Promise<unknown>)({
    context: { categoryTree },
  })

describe('/services loader (#3244)', () => {
  it('lists the api_v2 alpha pages in api_v2 mode', async () => {
    siteMocks.getApiV2CatalogEntries.mockResolvedValue([
      entry('/x/new-digital', true, 'alpha'),
      entry('/x/new-info', false, 'alpha'),
      entry('/terms', false, null),
    ])
    expect(await load({ kind: 'found', categories: [] })).toEqual([
      {
        title: '/x/new-digital',
        href: '/x/new-digital',
        slug: 'x/new-digital',
        digital: true,
      },
      {
        title: '/x/new-info',
        href: '/x/new-info',
        slug: 'x/new-info',
        digital: false,
      },
    ])
  })

  it('leaves the static list in place when api_v2 is off', async () => {
    expect(await load({ kind: 'disabled' })).toBeNull()
    expect(siteMocks.getApiV2CatalogEntries).not.toHaveBeenCalled()
  })
})

describe('/services page (#3244)', () => {
  // The start plugin code-splits the component; load it before a sync render.
  let component: ComponentType
  beforeAll(async () => {
    const lazy = Route.options.component as ComponentType & {
      preload?: () => Promise<void>
    }
    await lazy.preload?.()
    component = lazy
  })

  const render = (items: unknown) => {
    vi.spyOn(Route, 'useRouteContext').mockReturnValue({
      level: 'public',
      serviceStatuses: [],
    })
    vi.spyOn(Route, 'useLoaderData').mockReturnValue(items)
    return renderToStaticMarkup(createElement(component))
  }

  it('renders the api_v2 list with its label and event', () => {
    const html = render([
      {
        title: 'New digital',
        href: '/x/new-digital',
        slug: 'x/new-digital',
        digital: true,
      },
    ])
    expect(html).toContain('data-umami-event="service-x-new-digital"')
    expect(html).toContain('Digital service')
    expect(html.match(/<li/g)).toHaveLength(1)
  })

  // An empty api_v2 list replaces the static one, never falls back to it.
  it('shows no services for an empty api_v2 list', () => {
    expect(render([])).toContain('No alpha services yet.')
  })
})
