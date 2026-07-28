import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AnalyticsPage from './AnalyticsPage'
import type { OverviewPayload } from './lib/report'

// Router hooks need a router context; stub them for a unit render.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#test">{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ isLoading: false, location: { pathname: '/' } }),
}))

const overview: OverviewPayload = {
  configured: true,
  stats: {
    visitors: 10,
    pageviews: 20,
    sessions: 12,
    bounceRate: 0.25,
    avgStepsPerVisit: 1.7,
    searches: 3,
  },
  pages: [
    {
      path: '/',
      pageviews: 20,
      visitors: 10,
      topSources: [
        { referrer: 'alpha.gov.bb', count: 6 },
        { referrer: 'google.com', count: 2 },
      ],
    },
  ],
  forms: [
    {
      formId: 'birth-cert',
      title: 'Get a birth certificate',
      starts: 100,
      completions: 40,
      completionPct: 40,
    },
  ],
  flow: { nodes: [], links: [], total: 0 },
  journeys: [],
  period: { start: '2026-06-14', end: '2026-07-13' },
  generatedAt: '2026-07-10T12:00:00.000Z',
  window: 'last 30 days',
  range: 'past-30-days',
}

describe('AnalyticsPage', () => {
  it('renders the summary cards, period text and the linked form list', () => {
    render(<AnalyticsPage overview={overview} />)
    expect(screen.getByText('Most visited pages')).toBeTruthy()
    expect(screen.getByText('Get a birth certificate')).toBeTruthy()
    // summary cards
    expect(screen.getByText('Bounce rate')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy() // bounceRate 0.25
    expect(screen.getByText('Avg steps / visit')).toBeTruthy()
    // period sentence
    expect(
      screen.getByText(/Showing aggregate visitor data from 2026-06-14 to 2026-07-13/),
    ).toBeTruthy()
  })

  it('shows per-form starts and completion', () => {
    render(<AnalyticsPage overview={overview} />)
    expect(
      screen.getByRole('columnheader', { name: 'Starts' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('columnheader', { name: 'Completion' }),
    ).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy() // starts
    expect(screen.getByText(/40%/)).toBeTruthy() // completion
  })

  it('shows the top source column with the leading referrer and a +N for the rest', () => {
    render(<AnalyticsPage overview={overview} />)
    // "Top source" also appears in the how-it-works popover copy, so target the
    // column header specifically.
    expect(
      screen.getByRole('columnheader', { name: 'Top source' }),
    ).toBeTruthy()
    expect(screen.getByText('alpha.gov.bb')).toBeTruthy()
    expect(screen.getByText(/\+1/)).toBeTruthy()
  })

  it('renders the "How it works" popover triggers', () => {
    render(<AnalyticsPage overview={overview} />)
    expect(screen.getAllByText('How it works').length).toBeGreaterThan(0)
  })

  it('shows the setup message when analytics is not configured', () => {
    render(
      <AnalyticsPage
        overview={{
          configured: false,
          stats: {
            visitors: 0,
            pageviews: 0,
            sessions: 0,
            bounceRate: 0,
            avgStepsPerVisit: 0,
            searches: 0,
          },
          pages: [],
          forms: [],
          flow: { nodes: [], links: [], total: 0 },
          journeys: [],
          period: { start: '', end: '' },
          generatedAt: '',
          window: 'last 30 days',
          range: 'past-30-days',
        }}
      />,
    )
    expect(screen.getByText(/not configured/)).toBeTruthy()
  })
})
