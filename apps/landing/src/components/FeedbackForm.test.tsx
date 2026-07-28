// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendFeedback } from '../lib/send-feedback'
import { FeedbackForm } from './FeedbackForm'

vi.mock('../lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

vi.mock('../lib/send-feedback', () => ({
  sendFeedback: vi.fn(),
}))

describe('FeedbackForm', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(sendFeedback).mockReset()
    vi.mocked(sendFeedback).mockResolvedValue({ error: null, success: true })
  })

  it('reads the feedback referrer when the form is submitted', async () => {
    sessionStorage.setItem('feedbackReferrer', '/services/passports')
    render(<FeedbackForm />)

    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Why did you visit alpha.gov.bb?',
      }),
      { target: { value: 'I needed passport information' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send Feedback' }))

    await waitFor(() => {
      expect(sendFeedback).toHaveBeenCalledWith({
        data: {
          visitReason: 'I needed passport information',
          whatWentWrong: '',
          referrer: '/services/passports',
        },
      })
    })
  })
})
