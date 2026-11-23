import { createFileRoute } from '@tanstack/react-router'
import { CoverageCalculator } from './-ui/CoverageCalculator'
import { gateOnContentUrl } from '@/lib/content-gate'
import { pageHead } from '../../../lib/page-head'

const CONTENT_URL =
  'money-financial-support/national-insurance-for-self-employed-workers'

export const Route = createFileRoute(
  '/money-financial-support/national-insurance-for-self-employed-workers/form',
)({
  // Mirror the service page's rollout gate: hidden unless the viewer's level
  // meets the service's, reachable with the matching token. The runtime
  // service_status overlay can gate it too (a `disabled` service 404s here).
  beforeLoad: ({ context }) => gateOnContentUrl(CONTENT_URL, context),
  head: ({ match }) =>
    pageHead(
      'Estimate your National Insurance coverage',
      'If you work for yourself in Barbados, estimate what you would pay into National Insurance and the benefits you could get — sickness, maternity, invalidity, pension and more. Estimates only, pending confirmation by the NIS Self-Employed Unit.',
      { noindex: match.context.serviceLevel !== 'public' },
    ),
  component: CoverageCalculator,
})
