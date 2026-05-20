import {
  Button,
  ErrorSummary,
  Text,
  TextArea
  
} from '@govtech-bb/react'
import type {ErrorItem} from '@govtech-bb/react';
import { useEffect, useRef, useState, useTransition } from 'react'
import { sendFeedback  } from '../lib/send-feedback'
import type {FeedbackState} from '../lib/send-feedback';

const INITIAL: FeedbackState = { error: null }

export function FeedbackForm() {
  const [referrer, setReferrer] = useState('')
  const [state, setState] = useState<FeedbackState>(INITIAL)
  const [dismissed, setDismissed] = useState<FeedbackState | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const errorSummaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setReferrer(sessionStorage.getItem('feedbackReferrer') ?? '')
  }, [])

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  useEffect(() => {
    if (state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      errorSummaryRef.current?.focus()
      errorSummaryRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }, [state.fieldErrors])

  const fieldErrors = state.fieldErrors ?? {}
  const errorItems: Array<ErrorItem> = Object.entries(fieldErrors).map(
    ([field, message]) => ({ text: message, target: field }),
  )

  const handleErrorClick = (
    error: ErrorItem,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    event.preventDefault()
    const el = document.getElementById(error.target)
    if (el) {
      el.focus()
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData) as Record<string, string>
    startTransition(async () => {
      const result = await sendFeedback({ data })
      setState(result)
    })
  }

  const showSuccess = state.success && dismissed !== state
  const showServerError =
    !!state.error && Object.keys(fieldErrors).length === 0

  return (
    <div className="mb-6 space-y-6">
      {showSuccess ? (
        <div className="flex flex-wrap items-baseline gap-2 border-4 border-teal-40 bg-teal-10 p-6">
          <Text weight="bold">Thank you for your feedback.</Text>
          <Button
            className="text-black!"
            onClick={() => setDismissed(state)}
            variant="link"
          >
            Tell us something else
          </Button>
        </div>
      ) : (
        <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
          {errorItems.length > 0 && (
            <ErrorSummary
              errors={errorItems}
              onErrorClick={handleErrorClick}
              ref={errorSummaryRef}
              title="There is a problem"
            />
          )}
          <TextArea
            error={fieldErrors.visitReason}
            id="visitReason"
            label="Why did you visit alpha.gov.bb?"
            name="visitReason"
            rows={3}
          />
          <TextArea
            error={fieldErrors.whatWentWrong}
            id="whatWentWrong"
            label="What went wrong?"
            name="whatWentWrong"
            rows={4}
          />
          <input name="referrer" readOnly type="hidden" value={referrer} />
          <Button className="w-full" type="submit" variant="primary">
            {isPending ? 'Submitting...' : 'Send Feedback'}
          </Button>
          {showServerError && (
            <div className="rounded-md border border-red-100 bg-red-10 px-4 py-3 text-red-00">
              {state.error}
            </div>
          )}
        </form>
      )}
    </div>
  )
}
