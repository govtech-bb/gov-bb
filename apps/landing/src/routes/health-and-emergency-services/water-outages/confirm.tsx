import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import { confirmSubscription, type TokenOutcome } from './-lib/water-alerts'
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
}

function ConfirmPage() {
  const outcome = Route.useLoaderData()
  const m = MESSAGES[outcome] ?? MESSAGES.invalid
  return <ResultNotice body={m.body} title={m.title} tone={m.tone} />
}
