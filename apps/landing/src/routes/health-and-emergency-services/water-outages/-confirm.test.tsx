// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import type { ComponentType } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { TokenOutcome } from './-lib/water-alerts'
import { Route } from './confirm'

vi.mock('./-lib/water-alerts', () => ({ confirmSubscription: vi.fn() }))

const PATH = '/health-and-emergency-services/water-outages/confirm'

let ConfirmPage: ComponentType
beforeAll(async () => {
  // The route component is code-split; load it so it renders at once.
  const lazy = Route.options.component as ComponentType & {
    preload?: () => Promise<void>
  }
  await lazy.preload?.()
  ConfirmPage = lazy
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete window.umami
})

// The real trackEvent, with Umami stubbed, so the test sees what leaves the
// page: the event data and the URL it is filed under (#3510, #3503).
describe('confirm page events (#3510)', () => {
  it.each<[TokenOutcome, string]>([
    ['done', 'confirmed'],
    ['already', 'already-confirmed'],
    ['invalid', 'invalid-token'],
    ['unavailable', 'unavailable'],
  ])(
    'sends one tool-result for %s, from the browser, with the path only and never the token',
    async (result, outcome) => {
      const track = vi.fn()
      window.umami = { track }
      history.pushState(null, '', `${PATH}?token=tok-secret-1`)
      vi.spyOn(Route, 'useLoaderData').mockReturnValue(result)
      const { rerender } = render(
        <StrictMode>
          <ConfirmPage />
        </StrictMode>,
      )
      rerender(
        <StrictMode>
          <ConfirmPage />
        </StrictMode>,
      )
      expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy()
      const sent = track.mock.calls.map(([build]) =>
        (build as (p: Record<string, unknown>) => Record<string, unknown>)({}),
      )
      expect(sent).toMatchObject([
        {
          name: 'tool-result',
          data: { tool: 'water-outages', step: 'confirm', outcome },
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
