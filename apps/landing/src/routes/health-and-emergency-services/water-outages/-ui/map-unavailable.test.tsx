// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '@/lib/analytics'
import { WaterOutagesPage } from './outages-page'

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('../-lib/water-alerts', () => ({ subscribeWaterAlerts: vi.fn() }))
// The map's code fails to load, as when its chunk cannot be fetched.
vi.mock('./outage-map', () => {
  throw new Error('chunk failed to load')
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('water outages map that fails to load (#3510)', () => {
  it('sends map-failed once', async () => {
    render(
      <StrictMode>
        <WaterOutagesPage
          data={{ outages: [], checkedAt: null, now: 0, failed: false }}
          onRetry={vi.fn()}
          onSelect={vi.fn()}
          retrying={false}
          selected=""
        />
      </StrictMode>,
    )
    expect(await screen.findByText(/The map could not load/)).toBeTruthy()
    expect(trackEvent).toHaveBeenCalledOnce()
    expect(trackEvent).toHaveBeenCalledWith('tool-error', {
      tool: 'water-outages',
      error: 'map-failed',
    })
  })
})
