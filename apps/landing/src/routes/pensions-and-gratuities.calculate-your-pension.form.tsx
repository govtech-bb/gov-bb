import { createFileRoute } from '@tanstack/react-router'
import { PensionCalculator } from '../blocks/pension/PensionCalculator'
import { requireFormAccess } from '../lib/preview-mode'

export const Route = createFileRoute(
  '/pensions-and-gratuities/calculate-your-pension/form',
)({
  loader: ({ context }) =>
    requireFormAccess(
      'pensions-and-gratuities/calculate-your-pension',
      context.previewMode,
    ),
  head: () => ({
    meta: [
      { title: 'Calculate your pension | Government of Barbados' },
      {
        name: 'description',
        content:
          'Estimate your government pension, reduced pension, and gratuity lump sum from your months of pensionable service and last annual salary.',
      },
    ],
  }),
  component: PensionCalculator,
})
