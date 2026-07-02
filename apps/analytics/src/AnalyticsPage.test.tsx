import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import AnalyticsPage from './AnalyticsPage'

test('renders the dashboard from the committed snapshot', () => {
  render(<AnalyticsPage />)
  // Top pages table heading is always present when a preset exists.
  expect(screen.getByRole('combobox')).toBeDefined()
  expect(screen.getAllByRole('heading').length).toBeGreaterThan(0)
})
