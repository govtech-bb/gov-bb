import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Drives useRouterState's pathname per test; Link renders a plain anchor that
// forwards to→href and aria-current so active state is assertable.
let mockPathname = '/'
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string
    children: React.ReactNode
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: mockPathname } }),
}))

import { AnalyticsTabs } from './AnalyticsTabs'

beforeEach(() => {
  mockPathname = '/'
})

describe('AnalyticsTabs', () => {
  it('keeps the section tabs left in order and separates Search into its own nav (#2161)', () => {
    render(<AnalyticsTabs />)

    const primary = screen.getByRole('navigation', { name: 'Primary' })
    expect(
      within(primary)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Home', 'Forms', 'Pages', 'Tools'])
    // Search is not wedged among the content sections…
    expect(
      within(primary).queryByRole('link', { name: 'Search' }),
    ).toBeNull()

    // …it lives in its own (right-aligned) nav group.
    const searchNav = screen.getByRole('navigation', { name: 'Search' })
    expect(
      within(searchNav)
        .getByRole('link', { name: 'Search' })
        .getAttribute('href'),
    ).toBe('/analytics/search')
  })

  it('applies the active state to the repositioned Search tab', () => {
    mockPathname = '/analytics/search'
    render(<AnalyticsTabs />)

    const search = screen.getByRole('link', { name: 'Search' })
    expect(search.getAttribute('aria-current')).toBe('page')
    // the active underline span renders inside the active link
    expect(search.querySelector('span[aria-hidden="true"]')).not.toBeNull()
    expect(
      screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current'),
    ).toBeNull()
  })
})
