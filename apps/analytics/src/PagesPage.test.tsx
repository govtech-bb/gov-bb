import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PagesPage from './PagesPage'
import type { PagesPayload } from './lib/report'

// Router hooks need a router context; stub them for a unit render.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#test">{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ isLoading: false, location: { pathname: '/analytics/pages' } }),
}))

const data: PagesPayload = {
  configured: true,
  pages: [
    {
      path: '/family-birth-relationships/get-birth-certificate',
      title: 'Get a copy of a birth certificate',
      pageviews: 120,
      visitors: 90,
      formId: 'get-birth-certificate',
      topSources: [{ referrer: 'google', count: 10 }],
    },
    {
      path: '/health-and-emergency-services/stormready-barbados',
      title: 'StormReady Barbados',
      pageviews: 30,
      visitors: 25,
      formId: null,
      topSources: [],
    },
  ],
  window: 'last 30 days',
  range: 'past-30-days',
}

describe('PagesPage', () => {
  it('renders the pages table with title, path, traffic and a form flag', () => {
    render(<PagesPage data={data} />)
    expect(screen.getByRole('columnheader', { name: 'Page' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Form' })).toBeTruthy()
    expect(screen.getByText('Get a copy of a birth certificate')).toBeTruthy()
    expect(screen.getByText('120')).toBeTruthy()
    // guide page links to its form detail; content page shows no link
    expect(screen.getByRole('link', { name: 'Form' })).toBeTruthy()
  })

  it('filters rows by the free-text query (title or path)', () => {
    render(<PagesPage data={data} />)
    fireEvent.change(
      screen.getByRole('searchbox', { name: /filter pages/i }),
      { target: { value: 'stormready' } },
    )
    expect(screen.getByText('StormReady Barbados')).toBeTruthy()
    expect(screen.queryByText('Get a copy of a birth certificate')).toBeNull()
  })

  it('shows the not-configured message when analytics is off', () => {
    render(
      <PagesPage
        data={{
          configured: false,
          pages: [],
          window: 'last 30 days',
          range: 'past-30-days',
        }}
      />,
    )
    expect(screen.getByText('Analytics is not configured.')).toBeTruthy()
  })
})
