import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SITE_URL } from './site-url'

const config = vi.hoisted(() => ({
  apiV2Url: 'http://api.example',
  landingSecret: '',
}))

vi.mock('nitro/runtime-config', () => ({ useRuntimeConfig: () => config }))
vi.mock('./service-status', () => ({
  getServiceStatuses: async () => [],
  deriveVisibilityOverlay: () => new Map(),
}))
vi.mock('../content/registry', () => ({
  PAGES: [],
  isVisible: () => false,
  isCategoryVisible: () => false,
}))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('LANDING_SECRET', '')
  config.landingSecret = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** With a secret configured, model an exhausted bucket that only landing bypasses. */
function apiFetch(body: unknown) {
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    const token = new Headers(init?.headers).get('x-landing-token')
    const limited = config.landingSecret && token !== config.landingSecret
    return Response.json(limited ? { error: 'too_many_requests' } : body, {
      status: limited ? 429 : 200,
    })
  })
  vi.stubGlobal('fetch', fetchImpl)
  return fetchImpl
}

describe.each(['', 'landing-secret'])('landing token %j', (token) => {
  it('forwards the configured token through the version watcher', async () => {
    config.landingSecret = token
    const fetchImpl = apiFetch({ version: 'published-v1' })
    const { siteVersionChanges } = await import('./api-v2-page')

    expect(await siteVersionChanges()).toBe(1)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${config.apiV2Url}/site-version`)
    expect(new Headers(init?.headers).get('x-landing-token')).toBe(
      token || null,
    )
  })

  it('keeps API categories and pages in the sitemap when landing is exempt', async () => {
    config.landingSecret = token
    // One body for both reads: each schema ignores the other's key.
    const fetchImpl = apiFetch({
      categories: [
        {
          slug: 'new-category',
          url: '/new-category',
          title: 'New category',
          description: null,
          subcategories: [],
        },
      ],
      pages: [{ url: '/new-category/only-in-api-v2' }],
    })
    const { Route } = await import('../routes/sitemap[.]xml')
    // This route's GET handler does not use a request context.
    const { GET } = Route.options.server?.handlers as {
      GET: () => Promise<Response>
    }

    const response = await GET()
    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain(`<loc>${SITE_URL}/new-category</loc>`)
    expect(xml).toContain(`<loc>${SITE_URL}/new-category/only-in-api-v2</loc>`)
    expect(fetchImpl.mock.calls.map(([url]) => url).sort()).toEqual([
      `${config.apiV2Url}/catalog`,
      `${config.apiV2Url}/categories`,
    ])
    for (const [, init] of fetchImpl.mock.calls)
      expect(new Headers(init?.headers).get('x-landing-token')).toBe(
        token || null,
      )
  })
})
