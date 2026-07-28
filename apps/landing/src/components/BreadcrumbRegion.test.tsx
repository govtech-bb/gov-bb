/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BreadcrumbRegion, usePreviewBreadcrumbPath } from './BreadcrumbRegion'

interface MockMatch {
  status: 'success' | 'error'
  staticData: { breadcrumbMode?: 'location' | 'preview' }
}

const router = vi.hoisted(() => ({ matches: [] as MockMatch[] }))

vi.mock('@tanstack/react-router', () => ({
  useMatches: ({
    select,
  }: {
    select: (matches: MockMatch[]) => 'location' | 'preview' | undefined
  }) => select(router.matches),
}))

vi.mock('./Breadcrumbs', () => ({
  Breadcrumbs: ({ pathname }: { pathname?: string }) => (
    <nav aria-label="Breadcrumb" data-pathname={pathname ?? 'location'} />
  ),
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

  it('renders the public path registered by the preview route', () => {
    router.matches = [
      {
        status: 'success',
        staticData: { breadcrumbMode: 'preview' },
      },
    ]

    function PreviewRoute() {
      usePreviewBreadcrumbPath('/services/example')
      return <main />
    }

    render(
      <BreadcrumbRegion>
        <PreviewRoute />
      </BreadcrumbRegion>,
    )

    expect(
      screen
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getAttribute('data-pathname'),
    ).toBe('/services/example')
  })
})
