import { describe, expect, it, vi } from 'vitest'
import { getRouter } from './router'
import {
  installClickListener,
  installOutboundClickListener,
  trackPageview,
} from './lib/analytics'
import { FORMS_BASE_URL } from './config/env'

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
  installClickListener: vi.fn(),
  installOutboundClickListener: vi.fn(),
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

  // #3502: Umami's script has auto-track off, so this listener is the only
  // thing that sends data-umami-event clicks anywhere.
  it('installs the data-umami-event click listener', () => {
    getRouter()

    expect(installClickListener).toHaveBeenCalled()
  })

  // #3512: installed whether or not /journey is configured, and told the
  // forms origin so links to forms are not counted as leaving the service.
  it('installs the outbound click listener with the forms origin', () => {
    getRouter()

    expect(installOutboundClickListener).toHaveBeenCalledWith({
      internalOrigins: [FORMS_BASE_URL],
    })
  })
})
