import { createFileRoute } from '@tanstack/react-router'
import AnalyticsPage from '../AnalyticsPage'
import { fetchReport } from '../lib/report'

export const Route = createFileRoute('/')({
  // Runs server-side on the initial SSR load; the fetched report is dehydrated
  // into the page so the browser renders it without a second round-trip.
  loader: () => fetchReport(),
  component: Analytics,
})

function Analytics() {
  const { report, refreshedAt } = Route.useLoaderData()
  return <AnalyticsPage report={report} refreshedAt={refreshedAt} />
}
