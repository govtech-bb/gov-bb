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
    render(
      <Breadcrumbs pathname="/first-level/second-level/current-page" />,
    )

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.className).toContain('govbb-breadcrumbs')
    expect(nav.className).toContain(
      'govbb-breadcrumbs--collapse-on-mobile',
    )
    expect(
      nav.querySelector('ol')?.className,
    ).toBe('govbb-breadcrumbs__list')

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
    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' }),
    ).toBeNull()

    rerender(<Breadcrumbs pathname="/forms/example/form" />)
    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' }),
    ).toBeNull()
  })
})
