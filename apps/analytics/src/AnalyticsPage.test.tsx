import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import AnalyticsPage from './AnalyticsPage'
import { REPORT } from './lib/report'

test('renders the dashboard from the committed snapshot', () => {
  render(<AnalyticsPage />)
  // Top pages table heading is always present when a preset exists.
  expect(screen.getByRole('combobox')).toBeDefined()
  expect(screen.getAllByRole('heading').length).toBeGreaterThan(0)
})

test('renders the session-based consolidated section when the snapshot has it', () => {
  render(<AnalyticsPage />)
  if (REPORT.sessions) {
    expect(
      screen.getByText(/Journeys & funnels \(session-based\)/i),
    ).toBeDefined()
    expect(screen.getByText(/^Entry pages$/)).toBeDefined()
    expect(screen.getByText(/^Devices$/)).toBeDefined()
    expect(screen.getByText(/^Countries$/)).toBeDefined()
    // Freshness (#1917): header notes the session window.
    expect(screen.getByText(/session data: last \d+ days/i)).toBeDefined()
  }
})
