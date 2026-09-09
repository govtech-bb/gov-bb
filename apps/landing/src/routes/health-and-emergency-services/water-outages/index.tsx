import { createFileRoute, notFound } from '@tanstack/react-router'
import { isUrlVisible, urlLevel } from '../../../content/registry'
import { pageHead } from '../../../lib/page-head'
import { deriveVisibilityOverlay } from '../../../lib/service-status'
import { META } from './-meta'
import { getWaterOutages } from './-lib/water-alerts'
import { WaterOutagesPage } from './-ui/outages-page'

export const Route = createFileRoute(
  '/health-and-emergency-services/water-outages/',
)({
  beforeLoad: ({ context }) => {
    const overlay = deriveVisibilityOverlay(context.serviceStatuses)
    if (!isUrlVisible(META.url, context.level, overlay)) throw notFound()
    return { waterServiceLevel: urlLevel(META.url, overlay) }
  },
  loader: () => getWaterOutages(),
  head: ({ match }) =>
    pageHead(META.title, META.description, {
      noindex: match.context.waterServiceLevel !== 'public',
      path: `/${META.url}`,
    }),
  component: WaterOutagesRoute,
})

function WaterOutagesRoute() {
  const data = Route.useLoaderData()
  return <WaterOutagesPage data={data} />
}
