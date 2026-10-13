/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeedbackForm } from './FeedbackForm'

// Stub the design system + side-effecting deps so the test renders the form's
// own markup (where `noValidate` lives) without pulling in their internals.
vi.mock('@govtech-bb/react', () => ({
  Button: ({ children }: { children?: React.ReactNode }) => (
    <button>{children}</button>
  ),
  ErrorSummary: () => <div />,
  Input: () => <input />,
  Text: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TextArea: () => <textarea />,
}))
vi.mock('../lib/send-feedback', () => ({ sendFeedback: vi.fn() }))
vi.mock('../lib/analytics', () => ({ trackEvent: vi.fn() }))

afterEach(cleanup)

describe('FeedbackForm', () => {
  it('sets noValidate so our ErrorSummary handles a bad email, not the browser', () => {
    // With type="email" and native validation on, the browser would block
    // submit before onSubmit runs, so our error summary never shows. jsdom does
    // not run native validation, so only this assertion catches a regression.
    const { container } = render(<FeedbackForm />)
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    expect(form?.noValidate).toBe(true)
  })
})
