import { createFileRoute, notFound } from '@tanstack/react-router'
import { CropOverPermitsForm } from '../blocks/crop-over-permits/CropOverPermitsForm'
import { isUrlVisible, urlLevel } from '../content/registry'
import { pageHead } from '../lib/page-head'

const CONTENT_URL = 'business-trade/crop-over-permits'

export const Route = createFileRoute(
  '/business-trade/crop-over-permits/form',
)({
  // Mirror the service page's rollout gate: hidden unless the viewer's level
  // meets the service's, reachable with the matching token.
  beforeLoad: ({ context }) => {
    if (!isUrlVisible(CONTENT_URL, context.level)) throw notFound()
  },
  head: () =>
    pageHead(
      'Find the permits you need for a Crop Over event',
      'Answer a few questions and get a tailored checklist of the permits you need to run a Crop Over event in Barbados.',
      { noindex: urlLevel(CONTENT_URL) !== 'public' },
    ),
  component: CropOverPermitsForm,
})
