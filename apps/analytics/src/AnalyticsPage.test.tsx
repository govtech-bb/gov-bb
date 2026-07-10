import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { ReportModel } from '@govtech-bb/umami-analytics'
import AnalyticsPage from './AnalyticsPage'
// Real, PII-safe report kept as a rendering fixture (the live data now comes
// from the API's cached endpoint at runtime; see src/lib/report.ts).
import snapshot from './content/analytics-snapshot.json'

const REPORT = snapshot as unknown as ReportModel

test('renders the dashboard from a report', () => {
  render(<AnalyticsPage report={REPORT} refreshedAt="2026-07-10T09:00:00Z" />)
  // Top pages table heading is always present when a preset exists.
  expect(screen.getByRole('combobox')).toBeDefined()
  expect(screen.getAllByRole('heading').length).toBeGreaterThan(0)
})

test('renders the session-based consolidated section when the report has it', () => {
  render(<AnalyticsPage report={REPORT} refreshedAt="2026-07-10T09:00:00Z" />)
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

test('shows a warming-up message before the first refresh (cold start)', () => {
  render(<AnalyticsPage report={null} refreshedAt={null} />)
  expect(screen.getByText(/warming up/i)).toBeDefined()
})
