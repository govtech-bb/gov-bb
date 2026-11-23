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
import { PensionCalculator } from './PensionCalculator'

const { trackEventMock } = vi.hoisted(() => ({ trackEventMock: vi.fn() }))

vi.mock('@/lib/analytics', () => ({ trackEvent: trackEventMock }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

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
      <PensionCalculator />
    </StrictMode>,
  )
}

function press(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function enterDate(legend: RegExp, month: string, year: string) {
  const group = within(screen.getByRole('group', { name: legend }))
  fireEvent.change(group.getByLabelText('Month'), { target: { value: month } })
  fireEvent.input(group.getByLabelText('Year'), { target: { value: year } })
}

function enterSalary(salary: string) {
  fireEvent.input(screen.getByLabelText(/Last annual salary/), {
    target: { value: salary },
  })
}

// Service from January 1995 to June 2025 on a last salary of 98,765.
function reachEstimate() {
  renderCalculator()
  enterDate(/When you started/, '1', '1995')
  enterDate(/When you stopped/, '6', '2025')
  enterSalary('98765')
  press('Calculate pension')
}

describe('pension calculator tool events', () => {
  it('sends a form step view each time the form is shown, even in StrictMode', () => {
    reachEstimate()
    press('Calculate again')
    expect(sent('tool-step-view')).toEqual([
      { tool: 'pension-calculator', step: 'form' },
      { tool: 'pension-calculator', step: 'form' },
    ])
  })

  it('sends an estimated result once, with no amount', () => {
    reachEstimate()
    expect(screen.getByText('Your estimated pension')).toBeTruthy()
    expect(sent('tool-result')).toEqual([
      { tool: 'pension-calculator', outcome: 'estimated' },
    ])
  })

  it('sends required and format errors with the step', () => {
    renderCalculator()
    press('Calculate pension')
    enterDate(/When you started/, '1', '1995')
    enterDate(/When you stopped/, '6', '2025')
    enterSalary('lots')
    press('Calculate pension')

    expect(sent('tool-error')).toEqual([
      { tool: 'pension-calculator', step: 'form', error: 'required' },
      { tool: 'pension-calculator', step: 'form', error: 'format' },
    ])
    expect(sent('tool-step-view')).toHaveLength(1)
  })

  it('sends about from both views and call from the results', () => {
    renderCalculator()
    fireEvent.click(
      screen.getByRole('link', {
        name: 'Learn how your pension is calculated',
      }),
    )
    enterDate(/When you started/, '1', '1995')
    enterDate(/When you stopped/, '6', '2025')
    enterSalary('98765')
    press('Calculate pension')
    fireEvent.click(
      screen.getByRole('link', {
        name: 'See how the reduced pension and gratuity are calculated',
      }),
    )
    fireEvent.click(screen.getByRole('link', { name: '431-7400' }))

    expect(sent('tool-action')).toEqual([
      { tool: 'pension-calculator', action: 'about' },
      { tool: 'pension-calculator', action: 'about' },
      { tool: 'pension-calculator', action: 'call' },
    ])
  })

  it('never sends the dates, salary or pension estimate', () => {
    reachEstimate()
    fireEvent.click(screen.getByRole('link', { name: '431-7400' }))
    expect(trackEventMock).toHaveBeenCalled()
    // Codes only: no number, and no digit in any string.
    for (const [, data] of trackEventMock.mock.calls) {
      for (const value of Object.values(data)) {
        expect(value).toMatch(/^[a-z][a-z-]*$/)
      }
    }
  })
})
