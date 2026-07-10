import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FormPage from './FormPage'
import type { FormDetailData } from './lib/umami-server'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#test">{children}</a>
  ),
}))

const detail: FormDetailData = {
  formId: 'get-birth-certificate',
  title: 'Get a birth certificate',
  funnel: [
    { label: 'Start', count: 100, dropoffPct: 0 },
    { label: 'Review', count: 60, dropoffPct: 40 },
    { label: 'Submit', count: 45, dropoffPct: 25 },
  ],
  steps: [
    { stepId: 'a', title: 'Your details', reached: 100, completed: 80, abandoned: 20 },
    { stepId: 'b', title: 'Upload', reached: 80, completed: 80, abandoned: 0 },
  ],
  submitError: {
    total: 15,
    attempts: 100,
    rate: 0.15,
    byReason: [
      { reason: 'server', count: 9 },
      { reason: 'network', count: 6 },
    ],
  },
  journey: [{ items: ['/', '/forms/get-birth-certificate'], count: 12 }],
  generatedAt: '2026-07-10T12:00:00.000Z',
  window: 'last 30 days',
}

describe('FormPage', () => {
  it('renders funnel (#1914), per-step (#1915) and submit reliability (#1916)', () => {
    render(<FormPage detail={detail} />)
    expect(screen.getByText('Get a birth certificate')).toBeTruthy()
    // #1914 funnel
    expect(screen.getByText('Funnel — distinct visitors')).toBeTruthy()
    // #1915 per-step
    expect(screen.getByText('Per-step: reached vs completed')).toBeTruthy()
    expect(screen.getByText('Your details')).toBeTruthy()
    // #1916 submit reliability + rate + reason breakdown
    expect(screen.getByText('Submit reliability')).toBeTruthy()
    expect(screen.getByText('15%')).toBeTruthy()
    expect(screen.getByText(/server · 9/)).toBeTruthy()
    // #1917 freshness
    expect(screen.getByText(/last 30 days/)).toBeTruthy()
  })
})
