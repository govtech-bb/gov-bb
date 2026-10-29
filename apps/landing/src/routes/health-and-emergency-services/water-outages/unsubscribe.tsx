import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import { UnsubscribePanel } from './-ui/unsubscribe-panel'

export const Route = createFileRoute(
  '/health-and-emergency-services/water-outages/unsubscribe',
)({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  head: () =>
    pageHead(
      'Unsubscribe from water alerts',
      'Stop getting water-outage alert emails.',
      { noindex: true },
    ),
  component: UnsubscribePage,
})

function UnsubscribePage() {
  const { token } = Route.useSearch()
  return <UnsubscribePanel token={token} />
}
