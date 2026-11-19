import { createFileRoute } from '@tanstack/react-router'
import { PensionCalculator } from './-ui/PensionCalculator'
import { gateOnContentUrl } from '@/lib/content-gate'
import { pageHead } from '../../../lib/page-head'

const CONTENT_URL = 'pensions-and-gratuities/calculate-your-pension'

export const Route = createFileRoute(
  '/pensions-and-gratuities/calculate-your-pension/form',
)({
  // Mirror the service page's rollout gate: hidden unless the viewer's level
  // meets the service's, reachable with the matching token. The runtime
  // service_status overlay can gate it too (a `disabled` service 404s here).
  beforeLoad: ({ context }) => gateOnContentUrl(CONTENT_URL, context),
  head: ({ match }) =>
    pageHead(
      'Government Pension calculator',
      'Estimate your government pension, reduced pension, and gratuity lump sum from the years you were in pensionable service and your last annual salary.',
      { noindex: match.context.serviceLevel !== 'public' },
    ),
  component: PensionCalculator,
})
