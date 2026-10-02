import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ToolsPage from './ToolsPage'
import type { ToolsPayload } from './lib/report'

// Router hooks need a router context; stub them for a unit render.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#test">{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ isLoading: false, location: { pathname: '/analytics/tools' } }),
}))

const data: ToolsPayload = {
  configured: true,
  tools: [
    {
      name: 'Find an emergency shelter',
      path: '/health-and-emergency-services/find-an-emergency-shelter',
      pageviews: 150,
      visitors: 118,
      topSources: [{ referrer: 'google', count: 12 }],
    },
    {
      name: 'Check bank holiday dates',
      path: '/bank-holiday-calendar',
      pageviews: 0,
      visitors: 0,
      topSources: [],
    },
  ],
  window: 'last 30 days',
  range: 'past-30-days',
}

describe('ToolsPage', () => {
  it('renders the tools table with visits, pageviews and top source', () => {
    render(<ToolsPage data={data} />)
    expect(screen.getByRole('columnheader', { name: 'Tool' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Visits' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Pageviews' })).toBeTruthy()
    expect(screen.getByText('Find an emergency shelter')).toBeTruthy()
    expect(screen.getByText('118')).toBeTruthy() // summed visitors
    expect(screen.getByText('google')).toBeTruthy() // top source
  })

  it('lists a zero-traffic tool (so owners see it exists)', () => {
    render(<ToolsPage data={data} />)
    expect(screen.getByText('Check bank holiday dates')).toBeTruthy()
  })

  it('shows the summed-visitors caveat', () => {
    render(<ToolsPage data={data} />)
    expect(screen.getByText(/summed across a tool/i)).toBeTruthy()
  })

  it('shows the not-configured message when analytics is off', () => {
    render(
      <ToolsPage
        data={{
          configured: false,
          tools: [],
          window: 'last 30 days',
          range: 'past-30-days',
        }}
      />,
    )
    expect(screen.getByText('Analytics is not configured.')).toBeTruthy()
  })
})
