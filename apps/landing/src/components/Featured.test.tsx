/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Featured } from './Featured'

vi.mock('../lib/analytics', () => ({ trackEvent: vi.fn() }))

afterEach(cleanup)

describe('Featured', () => {
  it('links to all three featured destinations', () => {
    render(<Featured />)

    // The tracker is the reason this column exists, and its href comes from an
    // env-configurable constant — so a wiring mistake would be silent.
    const href = (name: string) =>
      screen.getByRole('link', { name }).getAttribute('href')

    expect(href('Track your application')).toBe(
      'https://tracker.sandbox.alpha.gov.bb',
    )
    expect(href('Ask the assistant')).toBe('https://chat.sandbox.alpha.gov.bb')
    expect(href('Bank holidays')).toBe('/bank-holiday-calendar')
  })

  it('is a region named by its own heading', () => {
    render(<Featured />)

    const region = screen.getByRole('region', { name: 'Featured' })
    expect(region.tagName).toBe('SECTION')
    // The association is aria-labelledby pointing at the h2, so a broken id
    // silently leaves the region unnamed.
    expect(screen.getByRole('heading', { name: 'Featured' }).id).toBe(
      region.getAttribute('aria-labelledby'),
    )
  })

  it('keeps each description with its link', () => {
    render(<Featured />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)

    const tracker = items.find((li) =>
      li.textContent?.includes('Track your application'),
    )
    expect(tracker?.textContent).toContain(
      'Check the status of something you have already applied for.',
    )
  })

  it('hides the decorative icon tiles from assistive technology', () => {
    const { container } = render(<Featured />)

    // The link text carries the meaning; the tiles are ornament. One hidden tile
    // per item, its icon hidden too, and nothing exposed as an image.
    expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(
      3,
    )
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(
      3,
    )
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })
})
