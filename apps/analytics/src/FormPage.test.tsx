import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FormPage from './FormPage'
import type { FormDetailData } from './lib/umami-server'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#test">{children}</a>
  ),
  useNavigate: () => () => {},
  useRouterState: () => false,
}))

const detail: FormDetailData = {
  formId: 'get-birth-certificate',
  title: 'Get a birth certificate',
  starts: 267,
  completed: 56,
  completionPct: 21,
  avgDurationSeconds: 958,
  totalFieldErrors: 198,
  avgFieldErrors: 0.74,
  stepBack: 46,
  stepEdit: 18,
  reviewed: 106,
  funnel: [
    { label: 'Start', count: 267, dropoffPct: 0 },
    { label: 'Step 1', count: 94, dropoffPct: 64.8 },
    { label: 'Step 2', count: 90, dropoffPct: -60.7 },
    { label: 'Submit', count: 56, dropoffPct: 12 },
  ],
  fieldErrors: [
    { field: 'firstName', count: 30 },
    { field: 'parish', count: 12 },
  ],
  validationReasons: [
    { field: 'required', count: 40 },
    { field: 'Parish is required', count: 8 },
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
  generatedAt: '2026-07-10T12:00:00.000Z',
  window: 'last 30 days',
  range: 'past-30-days',
}

describe('FormPage', () => {
  it('renders headline stats (distinct), the step funnel and the tables', () => {
    render(<FormPage detail={detail} />)
    expect(screen.getByText('Get a birth certificate')).toBeTruthy()
    // headline stats
    expect(screen.getByText('Starts')).toBeTruthy()
    // 267 shows in the stat card and again as the funnel's Start count
    expect(screen.getAllByText('267').length).toBeGreaterThan(0)
    expect(screen.getByText('Avg time to complete')).toBeTruthy()
    expect(screen.getByText('15m 58s')).toBeTruthy() // 958s
    expect(screen.getByText('Total field errors')).toBeTruthy()
    expect(screen.getByText('198')).toBeTruthy()
    // funnel
    expect(screen.getByText('Funnel')).toBeTruthy()
    expect(screen.getByText('Step 1')).toBeTruthy()
    // field-error + validation-reason tables
    expect(screen.getByText('firstName')).toBeTruthy()
    expect(screen.getByText('Required field left blank')).toBeTruthy()
    // unmapped reason shows as both label and code, hence getAllByText
    expect(screen.getAllByText('Parish is required').length).toBeGreaterThan(0)
    // submit reliability (#1916)
    expect(screen.getByText('Submit reliability')).toBeTruthy()
    expect(screen.getByText('15%')).toBeTruthy()
    // freshness (#1917)
    expect(screen.getByText(/last 30 days/)).toBeTruthy()
  })

  it('does not display the category', () => {
    render(<FormPage detail={detail} />)
    expect(screen.queryByText(/uncategor/i)).toBeNull()
  })
})
