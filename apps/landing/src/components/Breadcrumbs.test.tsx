/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentPropsWithoutRef } from 'react'
import type * as ReactRouter from '@tanstack/react-router'
import { Breadcrumbs } from './Breadcrumbs'

type MockLinkProps = ComponentPropsWithoutRef<'a'> & { to: string }

vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof ReactRouter>()),
  Link: ({ to, ...props }: MockLinkProps) => <a href={to} {...props} />,
  useLocation: () => ({ pathname: '/unused' }),
}))

afterEach(cleanup)

describe('Breadcrumbs', () => {
  it('renders the design-system component with responsive collapsing', () => {
    render(<Breadcrumbs pathname="/first-level/second-level/current-page" />)

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.className).toContain('govbb-breadcrumbs')
    expect(nav.className).toContain('govbb-breadcrumbs--collapse-on-mobile')
    expect(nav.querySelector('ol')?.className).toBe('govbb-breadcrumbs__list')

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Home',
      'First level',
      'Second level',
    ])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/first-level',
      '/first-level/second-level',
    ])
    expect(links[0]?.getAttribute('data-umami-event-depth')).toBe('0')
    expect(links[2]?.getAttribute('data-umami-event-depth')).toBe('2')
  })

  it('does not render breadcrumbs on roots or form routes', () => {
    const { rerender } = render(<Breadcrumbs pathname="/" />)
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()

    rerender(<Breadcrumbs pathname="/forms/example/form" />)
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
  })

  it.each([
    '/health-and-emergency-services/free-or-subsidised-medication',
    '/health-and-emergency-services/prescription-colours',
  ])('includes the pharmacy service parent for %s', (pathname) => {
    render(<Breadcrumbs pathname={pathname} />)

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Home',
      'Health and emergency services',
      'Find a pharmacy and check what Barbados Drug Service benefits it offers',
    ])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/health-and-emergency-services',
      '/health-and-emergency-services/find-an-open-pharmacy',
    ])
  })
})

describe('Breadcrumbs in api_v2 mode', () => {
  it("shows a page's own trail, the current page left unlinked", () => {
    render(
      <Breadcrumbs
        pathname="/renamed/register-a-birth"
        trail={[
          { name: 'Family (renamed)', url: '/renamed' },
          { name: 'Register a birth', url: '/renamed/register-a-birth' },
        ]}
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Home',
      'Family (renamed)',
    ])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/renamed',
    ])
  })

  it("labels an app route's category from the tree, and omits it when hidden", () => {
    const pathname = '/health-and-emergency-services/water-outages/confirm'

    const { rerender } = render(
      <Breadcrumbs
        pathname={pathname}
        categoryTree={{
          kind: 'found',
          categories: [
            {
              slug: 'health-and-emergency-services',
              url: '/health-and-emergency-services',
              title: 'Health (api_v2)',
              description: null,
              subcategories: [],
            },
          ],
        }}
      />,
    )

    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Home',
      'Health (api_v2)',
      'Check for water outages in your area',
    ])

    rerender(
      <Breadcrumbs
        pathname={pathname}
        categoryTree={{ kind: 'unavailable' }}
      />,
    )
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Home',
      'Check for water outages in your area',
    ])
  })
})
