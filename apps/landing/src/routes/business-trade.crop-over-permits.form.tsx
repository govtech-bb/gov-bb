import { createFileRoute, notFound } from '@tanstack/react-router'
import { CropOverPermitsForm } from '../blocks/crop-over-permits/CropOverPermitsForm'
import { isUrlPreview } from '../content/registry'
import { pageHead } from '../lib/page-head'

const CONTENT_URL = 'business-trade/crop-over-permits'

export const Route = createFileRoute(
  '/business-trade/crop-over-permits/form',
)({
  // Mirror the service page's rollout gate: hidden from the public while the
  // service is in preview, reachable with the preview token.
  beforeLoad: ({ context }) => {
    if (!context.preview && isUrlPreview(CONTENT_URL)) throw notFound()
  },
  head: () =>
    pageHead(
      'Find the permits you need for a Crop Over event',
      'Answer a few questions and get a tailored checklist of the permits you need to run a Crop Over event in Barbados.',
      { noindex: isUrlPreview(CONTENT_URL) },
    ),
  component: CropOverPermitsForm,
})
