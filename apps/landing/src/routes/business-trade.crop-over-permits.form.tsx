import { createFileRoute } from '@tanstack/react-router'
import { CropOverPermitsForm } from '../blocks/crop-over-permits/CropOverPermitsForm'

export const Route = createFileRoute(
  '/business-trade/crop-over-permits/form',
)({
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
