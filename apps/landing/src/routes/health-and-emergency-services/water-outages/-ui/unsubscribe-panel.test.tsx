// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { unsubscribeSubscription } from '../-lib/water-alerts'
import type { TokenOutcome } from '../-lib/water-alerts'
import { Route } from '../unsubscribe'
import { MESSAGES, UnsubscribePanel } from './unsubscribe-panel'

vi.mock('../-lib/water-alerts', () => ({ unsubscribeSubscription: vi.fn() }))

const unsubscribe = vi.mocked(unsubscribeSubscription)

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  delete window.umami
})

describe('UnsubscribePanel', () => {
  // The route must not unsubscribe while the page loads either.
  it('has no route loader', () => {
    expect(Route.options.loader).toBeUndefined()
  })

  // Mail scanners pre-open every emailed link; loading must change nothing.
  it('does not unsubscribe on render', () => {
    render(<UnsubscribePanel token="tok-1" />)
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeTruthy()
  })

  it('unsubscribes once with the token when the button is clicked', async () => {
    unsubscribe.mockResolvedValue('done')
    render(<UnsubscribePanel token="tok-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(
      await screen.findByRole('heading', { name: MESSAGES.done.title }),
    ).toBeTruthy()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledWith({ data: 'tok-1' })
  })

  it('shows the unavailable message when the call fails', async () => {
    unsubscribe.mockRejectedValue(new Error('down'))
    render(<UnsubscribePanel token="tok-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(
      await screen.findByRole('heading', { name: MESSAGES.unavailable.title }),
    ).toBeTruthy()
  })
})

// The real trackEvent, with Umami stubbed, so the test sees what leaves the
// page: the event data and the URL it is filed under (#3510, #3503).
describe('UnsubscribePanel events (#3510)', () => {
  const PATH = '/health-and-emergency-services/water-outages/unsubscribe'

  function sentToUmami(track: ReturnType<typeof vi.fn>) {
    return track.mock.calls.map(([build]) =>
      (build as (p: Record<string, unknown>) => Record<string, unknown>)({}),
    )
  }

  it.each<[string, () => Promise<TokenOutcome>, string]>([
    ['done', () => Promise.resolve('done'), 'unsubscribed'],
    ['already', () => Promise.resolve('already'), 'already-unsubscribed'],
    ['invalid', () => Promise.resolve('invalid'), 'invalid-token'],
    ['a failed call', () => Promise.reject(new Error('down')), 'unavailable'],
  ])(
    'sends one tool-result for %s, with the path only and never the token',
    async (_, respond, outcome) => {
      const track = vi.fn()
      window.umami = { track }
      history.pushState(null, '', `${PATH}?token=tok-secret-1`)
      unsubscribe.mockImplementation(respond)
      render(<UnsubscribePanel token="tok-secret-1" />)
      expect(track).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
      await vi.waitFor(() => expect(track).toHaveBeenCalled())
      const sent = sentToUmami(track)
      expect(sent).toMatchObject([
        {
          name: 'tool-result',
          data: { tool: 'water-outages', step: 'unsubscribe', outcome },
          url: PATH,
        },
      ])
      expect(Object.keys(sent[0].data as object)).toEqual([
        'tool',
        'step',
        'outcome',
      ])
      expect(JSON.stringify(sent)).not.toContain('tok-secret')
    },
  )
})
