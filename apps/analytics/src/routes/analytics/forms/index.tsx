import { createFileRoute } from '@tanstack/react-router'
import FormsPage from '../../../FormsPage'
import { fetchForms } from '../../../lib/report'
import { normaliseRange } from '../../../lib/umami-server'

export const Route = createFileRoute('/analytics/forms/')({
  validateSearch: (search: Record<string, unknown>) => ({
    range: normaliseRange(
      search.range == null ? undefined : String(search.range),
    ),
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) => fetchForms({ data: deps.range }),
  component: Forms,
})

function Forms() {
  const data = Route.useLoaderData()
  return <FormsPage data={data} />
}
