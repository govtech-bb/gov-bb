import { createFileRoute } from '@tanstack/react-router'
import FormPage from '../../../FormPage'
import { fetchFormDetail } from '../../../lib/report'
import { normaliseRange } from '../../../lib/umami-server'

export const Route = createFileRoute('/analytics/forms/$formId')({
  validateSearch: (search: Record<string, unknown>) => ({
    range: normaliseRange(
      search.range == null ? undefined : String(search.range),
    ),
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  // Fetch the form's detail server-side on load (SSR), so the page is a real,
  // shareable URL rather than a client-only drawer. Re-runs when ?range= changes.
  loader: ({ params, deps }) =>
    fetchFormDetail({ data: { formId: params.formId, range: deps.range } }),
  component: FormDetail,
})

function FormDetail() {
  const detail = Route.useLoaderData()
  return <FormPage detail={detail} />
}
