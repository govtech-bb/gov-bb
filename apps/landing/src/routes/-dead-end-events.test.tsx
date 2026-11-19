/**
 * @vitest-environment jsdom
 */
import { StrictMode } from 'react'
import type { ComponentType } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '../lib/analytics'

vi.mock('../lib/analytics', () => ({
  trackEvent: vi.fn(),
  UMAMI_SCRIPT_ATTRIBUTES: {},
}))

// Each view sends its event once, even when StrictMode runs effects twice and
// the page re-renders (#3513).
function renderTwice(Page: ComponentType) {
  const { rerender } = render(
    <StrictMode>
      <Page />
    </StrictMode>,
  )
  rerender(
    <StrictMode>
      <Page />
    </StrictMode>,
  )
}

afterEach(() => {
  cleanup()
  vi.mocked(trackEvent).mockClear()
})

describe('dead-end events (#3513)', () => {
  // Importing __root pulls the whole route and content graph, which can take
  // longer than the default timeout on a loaded runner.
  let NotFoundPage: ComponentType
  let ServiceUnavailable: ComponentType
  beforeAll(async () => {
    NotFoundPage = (await import('./__root')).Route.options
      .notFoundComponent as ComponentType
    // The route component is code-split; load it so it renders at once.
    const lazy = (await import('./service-unavailable')).Route.options
      .component as ComponentType & { preload?: () => Promise<void> }
    await lazy.preload?.()
    ServiceUnavailable = lazy
  }, 60_000)

  it('sends service-unavailable-view once, with no form', () => {
    renderTwice(ServiceUnavailable)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('service-unavailable-view', {})
  })

  it('sends page-not-found once, with the app and never the path', () => {
    renderTwice(NotFoundPage)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('page-not-found', {
      app: 'landing',
    })
  })
})
