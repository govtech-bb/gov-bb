import { createFileRoute, notFound } from '@tanstack/react-router'
import { SeveranceCalculator } from '../blocks/severance/SeveranceCalculator'
import { isUrlPreview } from '../content/registry'
import { pageHead } from '../lib/page-head'

const CONTENT_URL = 'money-financial-support/calculate-severance-pay'

export const Route = createFileRoute(
  '/money-financial-support/calculate-severance-pay/form',
)({
  // Mirror the service page's rollout gate: hidden from the public while the
  // service is in preview, reachable with the preview token.
  beforeLoad: ({ context }) => {
    if (!context.preview && isUrlPreview(CONTENT_URL)) throw notFound()
  },
  head: () =>
    pageHead(
      'Find out how much severance payment you are owed',
      'Estimate the severance payment you may be owed under the Severance Payments Act (Cap. 355A) if you were made redundant, your workplace was damaged by a disaster, you were laid off, or your employer died.',
      { noindex: isUrlPreview(CONTENT_URL) },
    ),
  component: SeveranceCalculator,
})
