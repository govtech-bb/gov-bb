import { createFileRoute, notFound } from '@tanstack/react-router'
import { CoverageCalculator } from './-ui/CoverageCalculator'
import { isUrlVisible, urlLevel } from '../../../content/registry'
import { pageHead } from '../../../lib/page-head'
import { deriveVisibilityOverlay } from '../../../lib/service-status'

const CONTENT_URL =
  'money-financial-support/national-insurance-for-self-employed-workers'

export const Route = createFileRoute(
  '/money-financial-support/national-insurance-for-self-employed-workers/form',
)({
  // Mirror the service page's rollout gate: hidden unless the viewer's level
  // meets the service's, reachable with the matching token. The runtime
  // service_status overlay can gate it too (a `disabled` service 404s here).
  beforeLoad: ({ context }) => {
    const overlay = deriveVisibilityOverlay(context.serviceStatuses)
    if (!isUrlVisible(CONTENT_URL, context.level, overlay)) throw notFound()
  },
  head: () =>
    pageHead(
      'Estimate your National Insurance coverage',
      'If you work for yourself in Barbados, estimate what you would pay into National Insurance and the benefits you could get — sickness, maternity, invalidity, pension and more. Estimates only, pending confirmation by the NIS Self-Employed Unit.',
      { noindex: urlLevel(CONTENT_URL) !== 'public' },
    ),
  component: CoverageCalculator,
})
