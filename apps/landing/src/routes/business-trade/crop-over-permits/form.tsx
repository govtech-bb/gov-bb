import { createFileRoute, notFound } from '@tanstack/react-router'
import { CropOverPermitsForm } from './-ui/CropOverPermitsForm'
import { isUrlVisible, urlLevel } from '../../../content/registry'
import { pageHead } from '../../../lib/page-head'
import { deriveVisibilityOverlay } from '../../../lib/service-status'

const CONTENT_URL = 'business-trade/crop-over-permits'

export const Route = createFileRoute(
  '/business-trade/crop-over-permits/form',
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
      'Find the permits you need for a Crop Over event',
      'Answer a few questions and get a tailored checklist of the permits you need to run a Crop Over event in Barbados.',
      { noindex: urlLevel(CONTENT_URL) !== 'public' },
    ),
  component: CropOverPermitsForm,
})
