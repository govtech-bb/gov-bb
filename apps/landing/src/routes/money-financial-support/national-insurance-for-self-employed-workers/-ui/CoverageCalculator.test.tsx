// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoverageCalculator } from './CoverageCalculator'

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }))

vi.mock('@/lib/analytics', () => ({ trackEvent: trackEventMock }))

// jsdom does not navigate, so stop link clicks before it tries.
const stopNavigation = (e: MouseEvent) => {
  if (e.target instanceof Element && e.target.closest('a')) e.preventDefault()
}

beforeEach(() => {
  trackEventMock.mockReset()
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  document.addEventListener('click', stopNavigation)
})

afterEach(() => {
  cleanup()
  document.removeEventListener('click', stopNavigation)
})

const sent = (name: string) =>
  trackEventMock.mock.calls.filter(([e]) => e === name).map(([, d]) => d)

function renderCalculator() {
  render(
    <StrictMode>
      <CoverageCalculator />
    </StrictMode>,
  )
}

function press(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function enter(label: RegExp, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } })
}

// Steady earnings of 2,500 a month, comparing the minimum contribution.
function reachResult() {
  renderCalculator()
  press('Estimate my contributions')
  fireEvent.click(screen.getByRole('radio', { name: 'No' }))
  enter(/usually earn each month/, '2500')
  press('Continue')
  fireEvent.click(screen.getByRole('radio', { name: /Minimum contribution/ }))
  press('See your estimated benefits')
}

describe('NIS self-employed calculator tool events', () => {
  it('sends one step view per screen shown, even in StrictMode', () => {
    renderCalculator()
    press('See the benefits you may get')
    press('Previous')
    press('Estimate my contributions')
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    enter(/usually earn each month/, '2500')
    press('Continue')
    fireEvent.click(screen.getByRole('radio', { name: /Minimum contribution/ }))
    press('See your estimated benefits')
    press('Show me next steps')

    expect(sent('tool-step-view').map((d) => d.step)).toEqual([
      'hero',
      'benefits',
      'hero',
      'income',
      'plan',
      'result',
      'next-steps',
    ])
    expect(sent('tool-step-view')[0]).toEqual({
      tool: 'nis-self-employed',
      step: 'hero',
    })
  })

  it('sends the plan code once per result, not on a return to it', () => {
    reachResult()
    press('Show me next steps')
    press('Previous')
    expect(sent('tool-step-view').at(-1)).toEqual({
      tool: 'nis-self-employed',
      step: 'result',
    })
    expect(sent('tool-result')).toEqual([
      { tool: 'nis-self-employed', outcome: 'estimated', plan: 'minimum' },
    ])
  })

  it('sends register when the NIS registration link is used', () => {
    renderCalculator()
    fireEvent.click(
      screen.getByRole('link', { name: /ready to register for NIS/ }),
    )
    expect(sent('tool-action')).toEqual([
      { tool: 'nis-self-employed', action: 'register' },
    ])
  })

  it('sends required and format errors with the step', () => {
    renderCalculator()
    press('Estimate my contributions')
    press('Continue')
    fireEvent.click(screen.getByRole('radio', { name: 'No' }))
    enter(/usually earn each month/, 'abc')
    press('Continue')
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    enter(/busy month look like/, '3000')
    enter(/busy months do you usually have/, '13')
    press('Continue')
    enter(/And a slow month/, '500')
    press('Continue')
    enter(/busy months do you usually have/, '4')
    press('Continue')
    press('See your estimated benefits')

    expect(sent('tool-error')).toEqual([
      { tool: 'nis-self-employed', step: 'income', error: 'required' },
      { tool: 'nis-self-employed', step: 'income', error: 'format' },
      { tool: 'nis-self-employed', step: 'income', error: 'required' },
      { tool: 'nis-self-employed', step: 'income', error: 'format' },
      { tool: 'nis-self-employed', step: 'plan', error: 'required' },
    ])
  })

  it('never sends the earnings or any contribution or benefit amount', () => {
    reachResult()
    expect(trackEventMock).toHaveBeenCalled()
    // Codes only: no number, and no digit in any string.
    for (const [, data] of trackEventMock.mock.calls) {
      for (const value of Object.values(data)) {
        expect(value).toMatch(/^[a-z][a-z-]*$/)
      }
    }
  })
})
