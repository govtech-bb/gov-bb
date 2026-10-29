// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { unsubscribeSubscription } from '../-lib/water-alerts'
import { Route } from '../unsubscribe'
import { MESSAGES, UnsubscribePanel } from './unsubscribe-panel'

vi.mock('../-lib/water-alerts', () => ({ unsubscribeSubscription: vi.fn() }))

const unsubscribe = vi.mocked(unsubscribeSubscription)

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('UnsubscribePanel', () => {
  // The route must not unsubscribe while the page loads either.
  it('has no route loader', () => {
    expect(Route.options.loader).toBeUndefined()
  })

  // Mail scanners pre-open every emailed link; loading must change nothing.
  it('does not unsubscribe on render', () => {
    render(<UnsubscribePanel token="tok-1" />)
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeTruthy()
  })

  it('unsubscribes once with the token when the button is clicked', async () => {
    unsubscribe.mockResolvedValue('done')
    render(<UnsubscribePanel token="tok-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(
      await screen.findByRole('heading', { name: MESSAGES.done.title }),
    ).toBeTruthy()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledWith({ data: 'tok-1' })
  })

  it('shows the unavailable message when the call fails', async () => {
    unsubscribe.mockRejectedValue(new Error('down'))
    render(<UnsubscribePanel token="tok-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(
      await screen.findByRole('heading', { name: MESSAGES.unavailable.title }),
    ).toBeTruthy()
  })
})
