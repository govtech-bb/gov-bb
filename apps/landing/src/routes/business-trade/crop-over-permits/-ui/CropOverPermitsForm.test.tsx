// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FEATURES, getActivePermits } from '../-lib/compute'
import { PERMITS } from '../-lib/permits'
import { CropOverPermitsForm } from './CropOverPermitsForm'

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }))

vi.mock('@/lib/analytics', () => ({ trackEvent: trackEventMock }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => '/business-trade/crop-over-permits/form',
}))

// jsdom does not navigate, so stop link clicks before it tries.
const stopNavigation = (e: MouseEvent) => {
  if (e.target instanceof Element && e.target.closest('a')) e.preventDefault()
}

beforeEach(() => {
  trackEventMock.mockReset()
  window.scrollTo = vi.fn()
  document.addEventListener('click', stopNavigation)
})

afterEach(() => {
  cleanup()
  document.removeEventListener('click', stopNavigation)
})

const sent = (name: string) =>
  trackEventMock.mock.calls.filter(([e]) => e === name).map(([, d]) => d)

function renderForm() {
  render(
    <StrictMode>
      <CropOverPermitsForm />
    </StrictMode>,
  )
}

function choose(name: RegExp) {
  fireEvent.click(screen.getByRole('radio', { name }))
}

function press(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

// A fete at a beach, over 1,000 people, with music and alcohol.
function reachResult() {
  renderForm()
  choose(/A fete or party/)
  press('Continue')
  choose(/A beach or park/)
  press('Continue')
  choose(/Over 1,000/)
  press('Continue')
  fireEvent.click(screen.getByLabelText(/playing music/))
  fireEvent.click(screen.getByLabelText(/selling or serving alcohol/))
  press('Show my permits')
}

function permitCard(name: string) {
  const card = screen.getByRole('link', { name }).closest('li')
  if (!card) throw new Error(`No card for ${name}`)
  return within(card)
}

describe('Crop Over permits tool events', () => {
  it('sends one step view per question shown, even in StrictMode', () => {
    reachResult()
    expect(sent('tool-step-view')).toEqual([
      { tool: 'crop-over-permits', step: 'q-event' },
      { tool: 'crop-over-permits', step: 'q-venue' },
      { tool: 'crop-over-permits', step: 'q-size' },
      { tool: 'crop-over-permits', step: 'q-features' },
    ])
  })

  it('sends the event and venue codes and the permit count once', () => {
    reachResult()
    const permits = getActivePermits('beach', {
      ...EMPTY_FEATURES,
      music: true,
      alcohol: true,
    }).length
    expect(sent('tool-result')).toEqual([
      {
        tool: 'crop-over-permits',
        outcome: 'checklist',
        event: 'fete',
        venue: 'beach',
        permits,
      },
    ])
  })

  it('sends the water venue for a boat cruise, which skips the venue question', () => {
    renderForm()
    choose(/A boat cruise/)
    press('Continue')
    choose(/Under 200/)
    press('Continue')
    press('Show my permits')
    expect(sent('tool-step-view').map((d) => d.step)).toEqual([
      'q-event',
      'q-size',
      'q-features',
    ])
    expect(sent('tool-result')).toEqual([
      expect.objectContaining({ event: 'cruise', venue: 'water' }),
    ])
  })

  it('sends a required error when a question is not answered', () => {
    renderForm()
    press('Continue')
    expect(sent('tool-error')).toEqual([
      { tool: 'crop-over-permits', step: 'q-event', error: 'required' },
    ])
    choose(/A concert or show/)
    press('Continue')
    press('Continue')
    expect(sent('tool-error')).toEqual([
      { tool: 'crop-over-permits', step: 'q-event', error: 'required' },
      { tool: 'crop-over-permits', step: 'q-venue', error: 'required' },
    ])
  })

  it('sends agency-link, apply-online and call with the permit ID', () => {
    reachResult()
    const card = permitCard('Special Occasion Liquor Licence')

    fireEvent.click(
      screen.getByRole('link', { name: 'Special Occasion Liquor Licence' }),
    )
    fireEvent.click(card.getByRole('link', { name: /Apply online/ }))
    const phone = card.getByRole('link', { name: '(246) 535-7011' })
    expect(phone.getAttribute('href')).toBe('tel:+12465357011')
    fireEvent.click(phone)

    expect(sent('tool-action')).toEqual([
      {
        tool: 'crop-over-permits',
        action: 'agency-link',
        target: 'liquor-licence',
      },
      {
        tool: 'crop-over-permits',
        action: 'apply-online',
        target: 'liquor-licence',
      },
      { tool: 'crop-over-permits', action: 'call', target: 'liquor-licence' },
    ])
  })

  it('sends codes and the permit count only, never free text', () => {
    reachResult()
    fireEvent.click(screen.getByRole('link', { name: 'Venue permit' }))
    expect(trackEventMock).toHaveBeenCalled()
    for (const [, data] of trackEventMock.mock.calls) {
      for (const [key, value] of Object.entries(data)) {
        if (key === 'permits') expect(Number.isInteger(value)).toBe(true)
        else expect(value).toMatch(/^[a-z][a-z-]*$/)
      }
    }
  })
})

describe('permit IDs', () => {
  it('gives every permit a unique code that is safe to send', () => {
    const ids = PERMITS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*$/)
  })

  // The tel: link prefixes +1 to the digits of the shown number.
  it('shows every phone number as a 10-digit Barbados number', () => {
    for (const { applyInPerson } of PERMITS) {
      if (applyInPerson?.tel) {
        expect(applyInPerson.tel.replace(/\D/g, '')).toMatch(/^246\d{7}$/)
      }
    }
  })
})
