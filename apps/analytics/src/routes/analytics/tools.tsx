import { createFileRoute } from '@tanstack/react-router'
import ToolsPage from '../../ToolsPage'
import { fetchTools } from '../../lib/report'
import { normaliseRange } from '../../lib/umami-server'

export const Route = createFileRoute('/analytics/tools')({
  validateSearch: (search: Record<string, unknown>) => ({
    range: normaliseRange(
      search.range == null ? undefined : String(search.range),
    ),
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) => fetchTools({ data: deps.range }),
  component: Tools,
})

function Tools() {
  const data = Route.useLoaderData()
  return <ToolsPage data={data} />
}
