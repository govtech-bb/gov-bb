import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SearchPage from './SearchPage'
import type { SearchPayload } from './lib/report'

// Router hooks need a router context; stub them for a unit render.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#test">{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ isLoading: false, location: { pathname: '/analytics/search' } }),
}))

const data: SearchPayload = {
  configured: true,
  searches: 150,
  clicks: 70,
  ctr: 0.467,
  zeroResultRate: 0.1,
  queries: [
    {
      query: 'passport',
      searches: 100,
      clicks: 60,
      ctr: 0.6,
      zeroResult: false,
    },
    { query: 'xyzzy', searches: 10, clicks: 0, ctr: 0, zeroResult: true },
  ],
  generatedAt: '2026-07-10T12:00:00.000Z',
  window: 'last 30 days',
  range: 'past-30-days',
}

describe('SearchPage', () => {
  it('renders the headline stats and the top-queries table', () => {
    render(<SearchPage data={data} />)
    expect(screen.getByText('Click-through rate')).toBeTruthy()
    expect(screen.getByText('46.7%')).toBeTruthy() // overall CTR
    expect(screen.getByText('Zero-result rate')).toBeTruthy()
    expect(screen.getByText('10%')).toBeTruthy() // zeroResultRate 0.1
    expect(screen.getByRole('columnheader', { name: 'Query' })).toBeTruthy()
    expect(screen.getByText('passport')).toBeTruthy()
    expect(screen.getByText('60%')).toBeTruthy() // per-query CTR
  })

  it('marks zero-result queries and dashes their CTR', () => {
    render(<SearchPage data={data} />)
    expect(screen.getByText('No results')).toBeTruthy()
    // the zero-result row shows a dash instead of a 0% CTR
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('shows the not-configured message when analytics is off', () => {
    render(
      <SearchPage
        data={{
          configured: false,
          searches: 0,
          clicks: 0,
          ctr: 0,
          zeroResultRate: 0,
          queries: [],
          generatedAt: '',
          window: 'last 30 days',
          range: 'past-30-days',
        }}
      />,
    )
    expect(screen.getByText(/not configured/)).toBeTruthy()
  })
})
