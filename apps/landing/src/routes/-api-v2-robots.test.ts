import { afterEach, describe, expect, it, vi } from 'vitest'
import { SITE_URL } from '../lib/site-url'

/**
 * robots.txt with api_v2 configured (#3257). The file is site-wide and reads
 * only VITE_ALLOW_INDEXING, so api_v2 pages follow the same rule as static
 * ones. The flag is read when the route module loads, so each case loads it
 * fresh; that is why this is not in -api-v2-head.test.ts.
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('robots.txt with api_v2 configured (#3257)', () => {
  it.each([
    ['false', 'User-agent: *\nDisallow: /\n'],
    ['true', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`],
  ])('follows VITE_ALLOW_INDEXING=%s', async (allow, body) => {
    vi.resetModules()
    vi.stubEnv('VITE_API_V2_URL', 'http://api.example')
    vi.stubEnv('VITE_ALLOW_INDEXING', allow)
    const { Route } = await import('./robots[.]txt')
    // SAFETY: the route declares a GET handler that takes no arguments.
    const handlers = Route.options.server?.handlers as {
      GET: () => Response
    }
    expect(await handlers.GET().text()).toBe(body)
  })
})
