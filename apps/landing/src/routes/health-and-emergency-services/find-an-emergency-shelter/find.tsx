import { createFileRoute, notFound } from '@tanstack/react-router'
import { PageShell } from '../../../components/PageShell'
import { isUrlVisible, urlLevel } from '../../../content/registry'
import { pageHead } from '../../../lib/page-head'
import { DESCRIPTION, FindEmergencyShelterPage, TITLE } from './-ui/find-page'

const CONTENT_URL = 'health-and-emergency-services/find-an-emergency-shelter'

export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-emergency-shelter/find',
)({
  beforeLoad: ({ context }) => {
    if (!isUrlVisible(CONTENT_URL, context.level)) throw notFound()
  },
  head: () =>
    pageHead(TITLE, DESCRIPTION, {
      noindex: urlLevel(CONTENT_URL) !== 'public',
    }),
  component: () => (
    <PageShell>
      <FindEmergencyShelterPage />
    </PageShell>
  ),
})
