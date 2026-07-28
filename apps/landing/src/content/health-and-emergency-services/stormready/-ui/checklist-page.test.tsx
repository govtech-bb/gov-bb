// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { StormReadyChecklistPage } from './checklist-page'

const STORAGE_KEY = 'stormready-checklist-v1'

describe('StormReadyChecklistPage', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('hydrates and persists checklist changes', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ w1: true }))
    render(<StormReadyChecklistPage />)

    const storedItem = await screen.findByRole('checkbox', {
      name: 'At least 3 gallons of drinking water per person, for 3 days',
    })
    expect(storedItem.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '1 gallon of water per pet per day',
      }),
    )

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
        w1: true,
        w2: true,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe('{}')
    })
  })
})
