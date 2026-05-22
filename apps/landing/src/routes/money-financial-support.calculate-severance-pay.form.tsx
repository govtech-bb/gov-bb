import { createFileRoute } from '@tanstack/react-router'
import { SeveranceCalculator } from '../blocks/severance/SeveranceCalculator'
import { requireFormAccess } from '../lib/preview-mode'

export const Route = createFileRoute(
  '/money-financial-support/calculate-severance-pay/form',
)({
  loader: ({ context }) =>
    requireFormAccess(
      'money-financial-support/calculate-severance-pay',
      context.previewMode,
    ),
  head: () => ({
    meta: [
      {
        title:
          'Find out how much severance payment you are owed | Government of Barbados',
      },
      {
        name: 'description',
        content:
          'Estimate the severance payment you may be owed under the Severance Payments Act (Cap. 355A) if you were made redundant, your workplace was damaged by a disaster, you were laid off, or your employer died.',
      },
    ],
  }),
  component: SeveranceCalculator,
})
