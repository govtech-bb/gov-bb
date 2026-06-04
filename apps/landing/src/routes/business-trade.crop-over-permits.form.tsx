import { createFileRoute, notFound } from '@tanstack/react-router'
import { CropOverPermitsForm } from '../blocks/crop-over-permits/CropOverPermitsForm'
import { isUrlPreview } from '../content/registry'

const CONTENT_URL = 'business-trade/crop-over-permits'

export const Route = createFileRoute(
  '/business-trade/crop-over-permits/form',
)({
  // Mirror the service page's rollout gate: hidden from the public while the
  // service is in preview, reachable with the preview token.
  beforeLoad: ({ context }) => {
    if (!context.preview && isUrlPreview(CONTENT_URL)) throw notFound()
  },
  head: () => ({
    meta: [
      {
        title:
          'Find the permits you need for a Crop Over event | Government of Barbados',
      },
      {
        name: 'description',
        content:
          'Answer a few questions and get a tailored checklist of the permits you need to run a Crop Over event in Barbados.',
      },
      ...(isUrlPreview(CONTENT_URL)
        ? [{ name: 'robots', content: 'noindex' }]
        : []),
    ],
  }),
  component: CropOverPermitsForm,
})
