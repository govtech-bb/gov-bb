import { createFileRoute } from '@tanstack/react-router'
import AnalyticsPage from '../AnalyticsPage'
import { fetchOverview } from '../lib/report'
import { normaliseRange } from '../lib/umami-server'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    range: normaliseRange(
      search.range == null ? undefined : String(search.range),
    ),
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  // Runs server-side on the initial SSR load; the overview is dehydrated into
  // the page so the browser renders it without a second round-trip. Re-runs when
  // the ?range= filter changes.
  loader: ({ deps }) => fetchOverview({ data: deps.range }),
  component: Analytics,
})

function Analytics() {
  const overview = Route.useLoaderData()
  return <AnalyticsPage overview={overview} />
}
