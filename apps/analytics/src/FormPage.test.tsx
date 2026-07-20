import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FormPage from './FormPage'
import type { FormDetailData } from './lib/umami-server'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#test">{children}</a>
  ),
  useNavigate: () => () => {},
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({
      isLoading: false,
      location: { pathname: '/analytics/forms/get-birth-certificate' },
    }),
}))

const detail: FormDetailData = {
  formId: 'get-birth-certificate',
  title: 'Get a birth certificate',
  visits: 320,
  starts: 267,
  completed: 56,
  completionPct: 21,
  visitsToStartsPct: 83.4,
  avgDurationSeconds: 958,
  totalFieldErrors: 198,
  funnel: [
    { label: 'Start', count: 267, dropoffPct: 0 },
    { label: 'Step 1: Tell us about yourself', count: 260, dropoffPct: 0 },
    {
      label: 'Step 2: Are you applying for yourself?',
      count: 200,
      dropoffPct: 0,
    },
    { label: 'Submit', count: 56, dropoffPct: 0 },
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
  it('renders the five headline metrics, the titled funnel and the tables', () => {
    render(<FormPage detail={detail} />)
    expect(screen.getByText('Get a birth certificate')).toBeTruthy()
    // headline metrics — each label appears twice (card label + hover title)
    expect(screen.getAllByText('Visits that started').length).toBeGreaterThan(0)
    expect(screen.getByText('83.4%')).toBeTruthy()
    expect(screen.getByText('267 of 320 visits')).toBeTruthy()
    expect(screen.getAllByText('Completion rate').length).toBeGreaterThan(0)
    expect(screen.getByText('56 of 267 starts')).toBeTruthy()
    expect(screen.getAllByText('Avg time to complete').length).toBeGreaterThan(0)
    expect(screen.getByText('15m 58s')).toBeTruthy() // 958s
    expect(
      screen.getAllByText('Field validation errors').length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('198')).toBeTruthy()
    // form failures card + its hover breakdown (submit-error events)
    expect(screen.getAllByText('Form failures').length).toBeGreaterThan(0)
    expect(screen.getByText('15')).toBeTruthy() // submitError.total
    expect(screen.getByText('form-submit-error')).toBeTruthy() // hint content
    // titled funnel: each step shows its title next to the step order
    expect(screen.getByText('Funnel')).toBeTruthy()
    expect(screen.getByText('Step 1: Tell us about yourself')).toBeTruthy()
    expect(
      screen.getByText('Step 2: Are you applying for yourself?'),
    ).toBeTruthy()
    // validation-reason table
    expect(screen.getByText('Required field left blank')).toBeTruthy()
    // unmapped reason shows as both label and code, hence getAllByText
    expect(screen.getAllByText('Parish is required').length).toBeGreaterThan(0)
  })

  it('does not display the category', () => {
    render(<FormPage detail={detail} />)
    expect(screen.queryByText(/uncategor/i)).toBeNull()
  })
})
