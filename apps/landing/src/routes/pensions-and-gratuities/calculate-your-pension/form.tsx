import { createFileRoute, notFound } from '@tanstack/react-router'
import { PensionCalculator } from './-ui/PensionCalculator'
import { isUrlVisible, urlLevel } from '../../../content/registry'
import { pageHead } from '../../../lib/page-head'
import { getServiceStatuses } from '../../../lib/service-status'

const CONTENT_URL = 'pensions-and-gratuities/calculate-your-pension'

export const Route = createFileRoute(
  '/pensions-and-gratuities/calculate-your-pension/form',
)({
  // Mirror the service page's rollout gate: hidden unless the viewer's level
  // meets the service's, reachable with the matching token. Also fetches the
  // service_status overrides (#1897, cached — see lib/service-status.ts) so
  // an admin's enabled/disabled toggle takes effect without a redeploy. Fetched
  // exactly once per request and returned into context so `head` (below) can
  // reuse it — a second call here would double the hits against the
  // throttled endpoint on a cold instance. A rejected fetch (the server-fn RPC
  // itself failing, not a validated-away bad response — resolveServiceStatuses
  // already degrades those internally) falls open to no overrides rather than
  // erroring the route (ADR 0030).
  beforeLoad: async ({ context }) => {
    const statusOverrides = await getServiceStatuses().catch(() => undefined)
    if (!isUrlVisible(CONTENT_URL, context.level, statusOverrides))
      throw notFound()
    return { statusOverrides }
  },
  head: ({ match }) =>
    pageHead(
      'Calculate your pension',
      'Estimate your government pension, reduced pension, and gratuity lump sum from your months of pensionable service and last annual salary.',
      {
        noindex:
          urlLevel(CONTENT_URL, match.context.statusOverrides) !== 'public',
      },
    ),
  component: PensionCalculator,
})
