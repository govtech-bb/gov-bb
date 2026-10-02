import { createFileRoute } from '@tanstack/react-router'
import SearchPage from '../../SearchPage'
import { fetchSearch } from '../../lib/report'
import { normaliseRange } from '../../lib/umami-server'

export const Route = createFileRoute('/analytics/search')({
  validateSearch: (search: Record<string, unknown>) => ({
    range: normaliseRange(
      search.range == null ? undefined : String(search.range),
    ),
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) => fetchSearch({ data: deps.range }),
  component: Search,
})

function Search() {
  const data = Route.useLoaderData()
  return <SearchPage data={data} />
}
