import { describe, expect, it, vi } from 'vitest'
import { getRouter } from './router'
import { trackPageview } from './lib/analytics'

// vi.mock calls are hoisted above the imports, so getRouter sees the mocks.
const subscribe = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  createRouter: vi.fn(() => ({ subscribe })),
}))
vi.mock('@tanstack/react-router-ssr-query', () => ({
  setupRouterSsrQueryIntegration: vi.fn(),
}))
vi.mock('./routeTree.gen', () => ({ routeTree: {} }))
vi.mock('./lib/analytics', () => ({
  configureJourney: vi.fn(),
  installJourneyClickListener: vi.fn(),
  trackPageview: vi.fn(),
}))

describe('getRouter', () => {
  // onResolved never fires on the first, server-rendered page or on a
  // preloaded click, so most page views were missed. Keep it onRendered.
  it('tracks page views on onRendered, not onResolved', () => {
    getRouter()

    expect(subscribe).toHaveBeenCalledWith('onRendered', trackPageview)
    expect(subscribe).not.toHaveBeenCalledWith('onResolved', expect.anything())
  })
})
