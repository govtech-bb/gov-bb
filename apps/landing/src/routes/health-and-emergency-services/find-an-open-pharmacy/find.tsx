import { createFileRoute } from '@tanstack/react-router'
import { PageShell } from '../../../components/PageShell'
import { gateOnContentUrl } from '@/lib/content-gate'
import { pageHead } from '../../../lib/page-head'
import { PHARMACY_FIND_HREF } from './-lib/routes'
import { DESCRIPTION, FindOpenPharmacyPage, TITLE } from './-ui/find-page'

const CONTENT_URL = 'health-and-emergency-services/find-an-open-pharmacy'

export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-open-pharmacy/find',
)({
  staticData: { breadcrumbMode: 'location' },
  // Mirror the markdown service page's rollout gate: hidden unless the
  // viewer's level meets the service's.
  beforeLoad: ({ context }) => gateOnContentUrl(CONTENT_URL, context),
  head: ({ match }) =>
    pageHead(TITLE, DESCRIPTION, {
      noindex: match.context.serviceLevel !== 'public',
      path: PHARMACY_FIND_HREF,
    }),
  component: () => (
    <PageShell>
      <FindOpenPharmacyPage />
    </PageShell>
  ),
})
