// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackEvent, trackPageview } from './analytics'

describe('trackEvent', () => {
  afterEach(() => {
    delete window.umami
    vi.restoreAllMocks()
  })

  it('no-ops when window.umami is absent', () => {
    expect(() => trackEvent('something')).not.toThrow()
  })

  it('forwards the event name when no data is given', () => {
    const track = vi.fn()
    window.umami = { track }
    trackEvent('header-home')
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('header-home')
  })

  it('forwards both the event name and data when data is given', () => {
    const track = vi.fn()
    window.umami = { track }
    trackEvent('search-submit', { query: 'passport', source: 'services' })
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('search-submit', {
      query: 'passport',
      source: 'services',
    })
  })
})

describe('trackPageview', () => {
  afterEach(() => {
    delete window.umami
    vi.restoreAllMocks()
  })

  it('no-ops when window.umami is absent', () => {
    expect(() => trackPageview()).not.toThrow()
  })

  it('calls umami.track() with no arguments to fire a pageview', () => {
    const track = vi.fn()
    window.umami = { track }
    trackPageview()
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith()
  })
})
