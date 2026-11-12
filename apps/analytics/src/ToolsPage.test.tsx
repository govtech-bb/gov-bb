import { render, screen, within } from '@testing-library/react'
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

const noSignUps = { submitted: 0, sent: 0, confirmed: 0, unsubscribed: 0 }

const data: ToolsPayload = {
  configured: true,
  tools: [
    {
      name: 'Find an emergency shelter',
      path: '/health-and-emergency-services/find-an-emergency-shelter',
      pageviews: 150,
      visitors: 118,
      topSources: [{ referrer: 'google', count: 12 }],
      events: {
        results: 40,
        noResultRate: 0.25,
        topAction: { action: 'call', count: 11 },
        errors: 10,
        errorRate: 0.2,
      },
    },
    {
      name: 'Calculate your Government pension',
      path: '/pensions-and-gratuities/calculate-your-pension',
      pageviews: 30,
      visitors: 20,
      topSources: [],
      events: {
        results: 9,
        noResultRate: null,
        topAction: null,
        errors: 0,
        errorRate: 0,
      },
    },
    {
      name: 'Check bank holiday dates',
      path: '/bank-holiday-calendar',
      pageviews: 0,
      visitors: 0,
      topSources: [],
      events: null,
    },
  ],
  waterAlerts: { submitted: 20, sent: 18, confirmed: 12, unsubscribed: 3 },
  window: 'last 30 days',
  range: 'past-30-days',
}

/** The text of a tool row's four event-metric cells. */
const eventCells = (name: RegExp) =>
  within(screen.getByRole('row', { name }))
    .getAllByRole('cell')
    .slice(3, 7)
    .map((c) => c.textContent)

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

  it("shows each tool's results, no-result rate, top action and error rate", () => {
    render(<ToolsPage data={data} />)
    for (const name of ['Results', 'No result', 'Top action', 'Error rate']) {
      expect(screen.getByRole('columnheader', { name })).toBeTruthy()
    }
    // Tool, Visits, Pageviews, then the four event metrics.
    expect(eventCells(/emergency shelter/)).toEqual([
      '40',
      '25%',
      'call (11)',
      '20%',
    ])
  })

  it('shows a dash for a metric a tool has no data for', () => {
    render(<ToolsPage data={data} />)
    expect(eventCells(/pension/)).toEqual(['9', '—', '—', '0%'])
  })

  it('shows a clear empty state for a tool with no tool events', () => {
    render(<ToolsPage data={data} />)
    const bankHolidays = screen.getByRole('row', { name: /bank holiday/ })
    expect(bankHolidays.textContent).toContain('No tool events in this period')
  })

  it('shows the water alert sign-up funnel', () => {
    render(<ToolsPage data={data} />)
    expect(
      screen.getByRole('heading', { name: 'Water outage alert sign-ups' }),
    ).toBeTruthy()
    for (const label of [
      'Submitted',
      'Confirmation email sent',
      'Confirmed',
      'Unsubscribed',
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText('18')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('shows an empty state for the funnel before any sign-up event', () => {
    render(<ToolsPage data={{ ...data, waterAlerts: noSignUps }} />)
    expect(
      screen.getByText('No alert sign-up events in this period.'),
    ).toBeTruthy()
    expect(screen.queryByText('Confirmed')).toBeNull()
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
          waterAlerts: noSignUps,
          window: 'last 30 days',
          range: 'past-30-days',
        }}
      />,
    )
    expect(screen.getByText('Analytics is not configured.')).toBeTruthy()
  })
})
