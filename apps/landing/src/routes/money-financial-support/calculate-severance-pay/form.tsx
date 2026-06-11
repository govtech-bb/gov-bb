import { createFileRoute, notFound } from '@tanstack/react-router'
import { SeveranceCalculator } from './-ui/SeveranceCalculator'
import { isUrlVisible, urlLevel } from '../../../content/registry'
import { pageHead } from '../../../lib/page-head'

const CONTENT_URL = 'money-financial-support/calculate-severance-pay'

export const Route = createFileRoute(
  '/money-financial-support/calculate-severance-pay/form',
)({
  // Mirror the service page's rollout gate: hidden unless the viewer's level
  // meets the service's, reachable with the matching token.
  beforeLoad: ({ context }) => {
    if (!isUrlVisible(CONTENT_URL, context.level)) throw notFound()
  },
  head: () =>
    pageHead(
      'Find out how much severance payment you are owed',
      'Estimate the severance payment you may be owed under the Severance Payments Act (Cap. 355A) if you were made redundant, your workplace was damaged by a disaster, you were laid off, or your employer died.',
      { noindex: urlLevel(CONTENT_URL) !== 'public' },
    ),
  component: SeveranceCalculator,
})
