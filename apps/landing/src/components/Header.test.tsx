/**
 * @vitest-environment jsdom
 */
import { forwardRef } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Header from './Header'

vi.mock('@tanstack/react-router', () => ({
  Link: forwardRef<HTMLAnchorElement, { to: string }>(
    ({ to, ...props }, ref) => <a ref={ref} href={to} {...props} />,
  ),
}))

afterEach(cleanup)

describe('Header', () => {
  it('lists About Barbados when the caller says it is visible', () => {
    render(<Header showAboutBarbados />)

    expect(
      screen.getAllByRole('link', { name: 'About Barbados' })[0],
    ).toHaveProperty('pathname', '/about-barbados')
  })

  it('omits About Barbados by default, as the CMS preview renders it', () => {
    render(<Header />)

    expect(screen.queryByRole('link', { name: 'About Barbados' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Services' })).not.toHaveLength(
      0,
    )
  })

  it('resolves brand images against the asset origin when one is given', () => {
    const { container } = render(<Header assetBase="https://alpha.gov.bb" />)

    expect(
      container.querySelector(
        'img[src="https://alpha.gov.bb/images/govbb-crest.svg"]',
      ),
    ).not.toBeNull()
    expect(
      container.querySelector(
        'img[src="https://alpha.gov.bb/images/govbb-logo.svg"]',
      ),
    ).not.toBeNull()
  })
})
