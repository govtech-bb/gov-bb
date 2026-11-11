/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type * as ReactRouter from '@tanstack/react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AvailableFormsContext, StartLink } from './StartLink'
import { configureJourney, getJourneyId } from '@/lib/analytics'

vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof ReactRouter>()),
  useLocation: () => ({ pathname: '/test' }),
}))

// jsdom can't navigate; stop the click there once React has handled it.
const stopNavigation = (e: Event) => e.preventDefault()

function renderStart() {
  render(
    <AvailableFormsContext.Provider value={new Set(['birth'])}>
      <StartLink formId="birth">Start now</StartLink>
    </AvailableFormsContext.Provider>,
  )
  return screen.getByRole('link', { name: 'Start now' }) as HTMLAnchorElement
}

describe('StartLink journey ID', () => {
  beforeAll(() => {
    configureJourney({ url: 'https://api.test/journey', app: 'landing' })
    document.addEventListener('click', stopNavigation)
    document.addEventListener('auxclick', stopNavigation)
  })
  afterEach(cleanup)

  it('adds ?jid= to the forms link when clicked, not in the markup', () => {
    const link = renderStart()
    expect(link.href).not.toContain('jid=')

    fireEvent.click(link)

    const url = new URL(link.href)
    expect(url.pathname).toBe('/forms/birth')
    expect(url.searchParams.get('jid')).toBe(getJourneyId())
    expect(getJourneyId()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('adds it on a middle-click into a new tab too', () => {
    const link = renderStart()
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    expect(new URL(link.href).searchParams.get('jid')).toBe(getJourneyId())
  })
})
