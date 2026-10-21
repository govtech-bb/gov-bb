/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BreadcrumbRegion } from './BreadcrumbRegion'

interface MockMatch {
  status: 'success' | 'error'
  staticData: { breadcrumbMode?: 'location' }
}

const router = vi.hoisted(() => ({ matches: [] as MockMatch[] }))

vi.mock('@tanstack/react-router', () => ({
  useMatches: ({
    select,
  }: {
    select: (matches: MockMatch[]) => 'location' | undefined
  }) => select(router.matches),
}))

vi.mock('./Breadcrumbs', () => ({
  Breadcrumbs: () => <nav aria-label="Breadcrumb" />,
}))

afterEach(() => {
  cleanup()
  router.matches = []
})

describe('BreadcrumbRegion', () => {
  it('renders successful route breadcrumbs immediately before main', () => {
    router.matches = [
      {
        status: 'success',
        staticData: { breadcrumbMode: 'location' },
      },
    ]

    const { container } = render(
      <BreadcrumbRegion>
        <main data-testid="main" />
      </BreadcrumbRegion>,
    )

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.parentElement?.nextElementSibling).toBe(
      screen.getByTestId('main'),
    )
    expect(container.querySelector('main nav')).toBeNull()
  })

  it('does not render route breadcrumbs for an error match', () => {
    router.matches = [
      {
        status: 'error',
        staticData: { breadcrumbMode: 'location' },
      },
    ]

    render(
      <BreadcrumbRegion>
        <main />
      </BreadcrumbRegion>,
    )

    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('does not render breadcrumbs for a route without breadcrumb metadata', () => {
    router.matches = [{ status: 'success', staticData: {} }]

    render(
      <BreadcrumbRegion>
        <main />
      </BreadcrumbRegion>,
    )

    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.getByRole('main')).toBeDefined()
  })
})
