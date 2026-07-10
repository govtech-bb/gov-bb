import { createFileRoute } from '@tanstack/react-router'
import AnalyticsPage from '../AnalyticsPage'
import { fetchOverview } from '../lib/report'

export const Route = createFileRoute('/')({
  // Runs server-side on the initial SSR load; the overview is dehydrated into
  // the page so the browser renders it without a second round-trip. Each form's
  // detail is fetched separately, on click.
  loader: () => fetchOverview(),
  component: Analytics,
})

function Analytics() {
  const overview = Route.useLoaderData()
  return <AnalyticsPage overview={overview} />
}
