import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/analytics'
import { pageHead } from '../../../lib/page-head'
import { confirmSubscription } from './-lib/water-alerts'
import type { TokenOutcome } from './-lib/water-alerts'
import { ResultNotice } from './-ui/result-notice'

export const Route = createFileRoute(
  '/health-and-emergency-services/water-outages/confirm',
)({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ deps }) => confirmSubscription({ data: deps.token }),
  head: () =>
    pageHead(
      'Confirm your water alerts',
      'Confirm your email to start getting water-outage alerts.',
      { noindex: true },
    ),
  component: ConfirmPage,
})

const MESSAGES: Record<
  TokenOutcome,
  { tone: 'success' | 'error'; title: string; body: string }
> = {
  done: {
    tone: 'success',
    title: "You're all set",
    body: 'You will now get an email when the Barbados Water Authority publishes a water notice for your area.',
  },
  already: {
    tone: 'success',
    title: 'Already confirmed',
    body: 'Your water alerts were already confirmed — there is nothing more to do.',
  },
  invalid: {
    tone: 'error',
    title: 'This link is not valid',
    body: 'This confirmation link is invalid or has expired. Please sign up again to get a new link.',
  },
  unavailable: {
    tone: 'error',
    title: 'We could not confirm your alerts',
    body: 'The water alerts service is unavailable. Please open this link again in a few minutes.',
  },
}

// The tool-result outcome for each answer. Never the token.
const RESULT_OUTCOME: Record<TokenOutcome, string> = {
  done: 'confirmed',
  already: 'already-confirmed',
  invalid: 'invalid-token',
  unavailable: 'unavailable',
}

function ConfirmPage() {
  const outcome = Route.useLoaderData()
  // A link opened from the email loads on the server, where trackEvent cannot
  // send, so the browser sends the result once it shows. The ref survives
  // StrictMode's second effect run.
  const tracked = useRef<TokenOutcome | null>(null)
  useEffect(() => {
    if (tracked.current === outcome) return
    tracked.current = outcome
    trackEvent('tool-result', {
      tool: 'water-outages',
      step: 'confirm',
      outcome: RESULT_OUTCOME[outcome],
    })
  }, [outcome])

  const m = MESSAGES[outcome] ?? MESSAGES.invalid
  return <ResultNotice body={m.body} title={m.title} tone={m.tone} />
}
