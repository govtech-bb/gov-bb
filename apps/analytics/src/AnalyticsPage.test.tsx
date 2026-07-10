import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AnalyticsPage from './AnalyticsPage'
import type { OverviewPayload } from './lib/report'

// The form drawer calls this server function on click; stub it so the module
// (which imports nitro/runtime-config) doesn't load its server-only deps here.
vi.mock('./lib/report', () => ({ fetchFormDetail: vi.fn() }))

const overview: OverviewPayload = {
  configured: true,
  stats: { visitors: 10, pageviews: 20 },
  pages: [{ path: '/', pageviews: 20, visitors: 10, topSources: [] }],
  forms: [{ formId: 'birth-cert', title: 'Get a birth certificate' }],
}

describe('AnalyticsPage', () => {
  it('renders the overview and the form list from the loader payload', () => {
    render(<AnalyticsPage overview={overview} />)
    expect(screen.getByText('Top pages')).toBeTruthy()
    expect(screen.getByText('Get a birth certificate')).toBeTruthy()
    expect(screen.getByText(/10 visitors/)).toBeTruthy()
  })

  it('shows the setup message when analytics is not configured', () => {
    render(
      <AnalyticsPage
        overview={{
          configured: false,
          stats: { visitors: 0, pageviews: 0 },
          pages: [],
          forms: [],
        }}
      />,
    )
    expect(screen.getByText(/not configured/)).toBeTruthy()
  })
})
