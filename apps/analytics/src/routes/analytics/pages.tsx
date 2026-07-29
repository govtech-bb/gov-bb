import { createFileRoute } from '@tanstack/react-router'
import PagesPage from '../../PagesPage'
import { fetchPages } from '../../lib/report'
import { normaliseRange } from '../../lib/umami-server'

export const Route = createFileRoute('/analytics/pages')({
  validateSearch: (search: Record<string, unknown>) => ({
    range: normaliseRange(
      search.range == null ? undefined : String(search.range),
    ),
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) => fetchPages({ data: deps.range }),
  component: Pages,
})

function Pages() {
  const data = Route.useLoaderData()
  return <PagesPage data={data} />
}
