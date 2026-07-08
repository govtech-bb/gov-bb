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
  // an admin's enabled/disabled toggle takes effect without a redeploy.
  beforeLoad: async ({ context }) => {
    const statusOverrides = await getServiceStatuses()
    if (!isUrlVisible(CONTENT_URL, context.level, statusOverrides))
      throw notFound()
  },
  head: async () =>
    pageHead(
      'Calculate your pension',
      'Estimate your government pension, reduced pension, and gratuity lump sum from your months of pensionable service and last annual salary.',
      {
        noindex:
          urlLevel(CONTENT_URL, await getServiceStatuses()) !== 'public',
      },
    ),
  component: PensionCalculator,
})
