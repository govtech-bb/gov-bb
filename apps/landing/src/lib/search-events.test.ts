/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Analytics from './analytics'
import { trackEvent } from './analytics'
import { trackSearchOnce } from './search-events'

vi.mock('./analytics', async (orig) => ({
  ...(await orig<typeof Analytics>()),
  trackEvent: vi.fn(),
}))

const sentEvents = () => vi.mocked(trackEvent).mock.calls

beforeEach(() => {
  window.umami = { track: vi.fn() }
})

afterEach(() => {
  delete window.umami
  vi.unstubAllGlobals()
  vi.mocked(trackEvent).mockReset()
  sessionStorage.clear()
})

describe('trackSearchOnce', () => {
  it('sends a query once per session, even when its result count changes', () => {
    trackSearchOnce('passport', 3)
    trackSearchOnce('passport', 3) // Back or reload remounts the page
    trackSearchOnce('passport', 4) // the loader settles on another count

    expect(sentEvents()).toEqual([
      ['search', { query: 'passport', results: 3 }],
    ])
  })

  it('sends search-no-results once per session', () => {
    trackSearchOnce('zzz', 0)
    trackSearchOnce('zzz', 0)

    expect(sentEvents()).toEqual([
      ['search', { query: 'zzz', results: 0 }],
      ['search-no-results', { query: 'zzz' }],
    ])
  })

  it('still sends a new query in the same session', () => {
    trackSearchOnce('passport', 3)
    trackSearchOnce('driving licence', 0)

    expect(sentEvents()).toEqual([
      ['search', { query: 'passport', results: 3 }],
      ['search', { query: 'driving licence', results: 0 }],
      ['search-no-results', { query: 'driving licence' }],
    ])
  })

  it('keys a query as Umami groups it: masked, case kept', () => {
    trackSearchOnce('ID 123456', 0)
    trackSearchOnce('ID 199996', 0) // also sent as "ID 1****6"
    trackSearchOnce('Passport', 1)
    trackSearchOnce('passport', 1) // a separate row in the shapers

    expect(sentEvents()).toEqual([
      ['search', { query: 'ID 123456', results: 0 }],
      ['search-no-results', { query: 'ID 123456' }],
      ['search', { query: 'Passport', results: 1 }],
      ['search', { query: 'passport', results: 1 }],
    ])
    expect(sessionStorage.getItem('search-events-sent')).not.toContain('123456')
  })

  it('starts afresh when the stored list is not a list', () => {
    sessionStorage.setItem('search-events-sent', '{"passport":1}')
    trackSearchOnce('passport', 3)
    trackSearchOnce('passport', 3)

    expect(sentEvents()).toEqual([
      ['search', { query: 'passport', results: 3 }],
    ])
  })

  it('stores nothing when analytics is off', () => {
    delete window.umami
    trackSearchOnce('my name', 0)

    expect(sessionStorage.getItem('search-events-sent')).toBeNull()
  })

  it('sends on each mount, without a crash, when storage throws', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked })

    expect(() => {
      trackSearchOnce('zzz', 0)
      trackSearchOnce('zzz', 0)
    }).not.toThrow()

    expect(sentEvents()).toEqual([
      ['search', { query: 'zzz', results: 0 }],
      ['search-no-results', { query: 'zzz' }],
      ['search', { query: 'zzz', results: 0 }],
      ['search-no-results', { query: 'zzz' }],
    ])
  })
})
