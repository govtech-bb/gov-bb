import { createFileRoute } from '@tanstack/react-router'
import { CropOverPermitsForm } from '../blocks/crop-over-permits/CropOverPermitsForm'
import { requireFormAccess } from '../lib/preview-mode'

export const Route = createFileRoute(
  '/business-trade/crop-over-permits/form',
)({
  loader: ({ context }) =>
    requireFormAccess(
      'business-trade/crop-over-permits',
      context.previewMode,
    ),
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
    ],
  }),
  component: CropOverPermitsForm,
})
