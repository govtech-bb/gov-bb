import { createFileRoute, notFound } from '@tanstack/react-router'
import { PensionCalculator } from '../blocks/pension/PensionCalculator'
import { isUrlPreview } from '../content/registry'

const CONTENT_URL = 'pensions-and-gratuities/calculate-your-pension'

export const Route = createFileRoute(
  '/pensions-and-gratuities/calculate-your-pension/form',
)({
  // Mirror the service page's rollout gate: hidden from the public while the
  // service is in preview, reachable with the preview token.
  beforeLoad: ({ context }) => {
    if (!context.preview && isUrlPreview(CONTENT_URL)) throw notFound()
  },
  head: () => ({
    meta: [
      { title: 'Calculate your pension | Government of Barbados' },
      {
        name: 'description',
        content:
          'Estimate your government pension, reduced pension, and gratuity lump sum from your months of pensionable service and last annual salary.',
      },
      ...(isUrlPreview(CONTENT_URL)
        ? [{ name: 'robots', content: 'noindex' }]
        : []),
    ],
  }),
  component: PensionCalculator,
})
