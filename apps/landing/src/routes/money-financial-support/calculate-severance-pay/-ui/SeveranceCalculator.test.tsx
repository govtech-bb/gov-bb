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
import { SeveranceCalculator } from './SeveranceCalculator'

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
      <SeveranceCalculator />
    </StrictMode>,
  )
}

function choose(name: string) {
  fireEvent.click(screen.getByRole('radio', { name }))
}

function press(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function enterDate(legend: string, date: string) {
  const [day, month, year] = date.split(' ')
  const group = within(screen.getByRole('group', { name: legend }))
  fireEvent.input(group.getByLabelText('Day'), { target: { value: day } })
  fireEvent.input(group.getByLabelText('Month'), { target: { value: month } })
  fireEvent.input(group.getByLabelText('Year'), { target: { value: year } })
}

function enterPay(pay: string) {
  fireEvent.input(screen.getByLabelText(/Average weekly pay/), {
    target: { value: pay },
  })
}

// An employee made redundant after 10 years, on a weekly pay of 987.
function reachEstimate() {
  renderCalculator()
  choose('No')
  press('Continue')
  choose('My job was cut or made redundant')
  press('Continue')
  enterDate('Start date', '1 1 2010')
  enterDate('End date', '1 1 2020')
  press('Continue')
  enterPay('987')
  press('Continue')
}

describe('severance calculator tool events', () => {
  it('sends one step view per question shown, even in StrictMode', () => {
    reachEstimate()
    expect(sent('tool-step-view')).toEqual([
      { tool: 'severance-calculator', step: 'q-employment' },
      { tool: 'severance-calculator', step: 'q-reason' },
      { tool: 'severance-calculator', step: 'q-years' },
      { tool: 'severance-calculator', step: 'q-pay' },
    ])
  })

  it('sends an eligible result once, with no amount', () => {
    reachEstimate()
    expect(screen.getByText('Your severance payment estimate')).toBeTruthy()
    expect(sent('tool-result')).toEqual([
      { tool: 'severance-calculator', outcome: 'eligible' },
    ])
  })

  it.each([
    [
      'self-employed',
      () => {
        choose('Yes')
        press('Continue')
      },
    ],
    [
      'reason-not-covered',
      () => {
        choose('No')
        press('Continue')
        choose('None of these')
        press('Continue')
      },
    ],
    [
      'under-two-years',
      () => {
        choose('No')
        press('Continue')
        choose('Death of employer')
        press('Continue')
        enterDate('Start date', '1 1 2019')
        enterDate('End date', '1 6 2020')
        press('Continue')
      },
    ],
  ])('sends a not-eligible result with the %s reason', (reason, answer) => {
    renderCalculator()
    answer()
    expect(sent('tool-result')).toEqual([
      { tool: 'severance-calculator', outcome: 'not-eligible', reason },
    ])
  })

  it('sends required and format errors with the step', () => {
    renderCalculator()
    press('Continue')
    choose('No')
    press('Continue')
    press('Continue')
    choose('I was laid off (period of 6 months)')
    press('Continue')
    press('Continue')
    enterDate('Start date', '31 2 2010')
    enterDate('End date', '1 1 2020')
    press('Continue')
    enterDate('Start date', '1 1 2010')
    press('Continue')
    press('Continue')
    enterPay('abc')
    press('Continue')

    expect(sent('tool-error')).toEqual([
      { tool: 'severance-calculator', step: 'q-employment', error: 'required' },
      { tool: 'severance-calculator', step: 'q-reason', error: 'required' },
      { tool: 'severance-calculator', step: 'q-years', error: 'required' },
      { tool: 'severance-calculator', step: 'q-years', error: 'format' },
      { tool: 'severance-calculator', step: 'q-pay', error: 'required' },
      { tool: 'severance-calculator', step: 'q-pay', error: 'format' },
    ])
  })

  it('sends call and restart, then a fresh step view', () => {
    reachEstimate()
    fireEvent.click(screen.getByRole('link', { name: '+1 246-431-7400' }))
    press('Start again')

    expect(sent('tool-action')).toEqual([
      { tool: 'severance-calculator', action: 'call' },
      { tool: 'severance-calculator', action: 'restart' },
    ])
    expect(sent('tool-step-view').at(-1)).toEqual({
      tool: 'severance-calculator',
      step: 'q-employment',
    })
  })

  it('never sends the dates, pay or severance amount', () => {
    reachEstimate()
    fireEvent.click(screen.getByRole('link', { name: '+1 246-431-7400' }))
    expect(trackEventMock).toHaveBeenCalled()
    // Codes only: no number, and no digit in any string.
    for (const [, data] of trackEventMock.mock.calls) {
      for (const value of Object.values(data)) {
        expect(value).toMatch(/^[a-z][a-z-]*$/)
      }
    }
  })
})
