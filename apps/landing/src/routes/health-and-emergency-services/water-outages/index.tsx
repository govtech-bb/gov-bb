import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import { META } from './-meta'
import { getWaterOutages } from './-lib/water-alerts'
import { WaterOutagesPage } from './-ui/outages-page'

export const Route = createFileRoute(
  '/health-and-emergency-services/water-outages/',
)({
  head: () => pageHead(META.title, META.description),
  loader: () => getWaterOutages(),
  component: WaterOutagesRoute,
})

function WaterOutagesRoute() {
  const data = Route.useLoaderData()
  return <WaterOutagesPage data={data} />
}
