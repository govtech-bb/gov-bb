import { createFileRoute } from '@tanstack/react-router'
import { SeveranceCalculator } from './-ui/SeveranceCalculator'
import { gateOnContentUrl } from '@/lib/content-gate'
import { pageHead } from '../../../lib/page-head'

const CONTENT_URL = 'money-financial-support/calculate-severance-pay'

export const Route = createFileRoute(
  '/money-financial-support/calculate-severance-pay/form',
)({
  // Mirror the service page's rollout gate: hidden unless the viewer's level
  // meets the service's, reachable with the matching token. The runtime
  // service_status overlay can gate it too (a `disabled` service 404s here).
  beforeLoad: ({ context }) => gateOnContentUrl(CONTENT_URL, context),
  head: ({ match }) =>
    pageHead(
      'Find out how much severance payment you are owed',
      'Estimate the severance payment you may be owed under the Severance Payments Act (Cap. 355A) if you were made redundant, your workplace was damaged by a disaster, you were laid off, or your employer died.',
      { noindex: match.context.serviceLevel !== 'public' },
    ),
  component: SeveranceCalculator,
})
