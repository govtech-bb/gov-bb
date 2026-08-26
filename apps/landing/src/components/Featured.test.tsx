/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Featured } from './Featured'
import { CHAT_URL } from '../lib/chat-url'
import { TRACKER_URL } from '../lib/tracker-url'

vi.mock('../lib/analytics', () => ({ trackEvent: vi.fn() }))

afterEach(cleanup)

describe('Featured', () => {
  it('links to all three featured destinations', () => {
    render(<Featured />)

    // The tracker is the reason this column exists, and its href comes from an
    // env-configurable constant — so a wiring mistake would be silent.
    //
    // Asserted against the constants, NOT against their default values.
    // Vitest loads .env / .env.local, and both constants resolve
    // `import.meta.env` at transform time, so pinning the literal
    // 'https://tracking.alpha.gov.bb' here would fail for any developer who had
    // followed this app's own README and set VITE_TRACKER_URL for local dev.
    // What matters is that each link is wired to the right constant, which this
    // still checks: swap the two and the tracker link no longer equals
    // TRACKER_URL.
    const href = (name: string) =>
      screen.getByRole('link', { name }).getAttribute('href')

    expect(href('Track your application')).toBe(TRACKER_URL)
    expect(href('Ask the assistant')).toBe(CHAT_URL)
    // Not env-driven: an internal route, so the literal is the contract.
    expect(href('Bank holidays')).toBe('/bank-holiday-calendar')

    // Guards the assertions above against being vacuously true if the two
    // constants ever resolved to the same value.
    expect(TRACKER_URL).not.toBe(CHAT_URL)
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
