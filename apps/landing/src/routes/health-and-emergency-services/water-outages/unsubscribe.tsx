import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import { type TokenOutcome, unsubscribeSubscription } from './-lib/water-alerts'
import { ResultNotice } from './-ui/result-notice'

export const Route = createFileRoute(
  '/health-and-emergency-services/water-outages/unsubscribe',
)({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ deps }) => unsubscribeSubscription({ data: deps.token }),
  head: () =>
    pageHead(
      'Unsubscribe from water alerts',
      'Stop getting water-outage alert emails.',
    ),
  component: UnsubscribePage,
})

const MESSAGES: Record<
  TokenOutcome,
  { tone: 'success' | 'error'; title: string; body: string }
> = {
  done: {
    tone: 'success',
    title: 'You have been unsubscribed',
    body: 'You will no longer get water-outage alert emails. You can sign up again any time.',
  },
  already: {
    tone: 'success',
    title: 'Already unsubscribed',
    body: 'You were already unsubscribed — you will not get any more alert emails.',
  },
  invalid: {
    tone: 'error',
    title: 'This link is not valid',
    body: 'This unsubscribe link is invalid or has expired. If you keep getting emails, contact us.',
  },
}

function UnsubscribePage() {
  const outcome = Route.useLoaderData()
  const m = MESSAGES[outcome] ?? MESSAGES.invalid
  return <ResultNotice body={m.body} title={m.title} tone={m.tone} />
}
