import { createFileRoute, notFound } from '@tanstack/react-router'
import { PageShell } from '../../../components/PageShell'
import { isUrlVisible, urlLevel } from '../../../content/registry'
import { pageHead } from '../../../lib/page-head'
import { deriveVisibilityOverlay } from '../../../lib/service-status'
import { PHARMACY_FIND_HREF } from './-lib/routes'
import { DESCRIPTION, FindOpenPharmacyPage, TITLE } from './-ui/find-page'

const CONTENT_URL = 'health-and-emergency-services/find-an-open-pharmacy'

export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-open-pharmacy/find',
)({
  staticData: { breadcrumbMode: 'location' },
  // Mirror the markdown service page's rollout gate: hidden unless the
  // viewer's level meets the service's.
  beforeLoad: ({ context }) => {
    const overlay = deriveVisibilityOverlay(context.serviceStatuses)
    if (!isUrlVisible(CONTENT_URL, context.level, overlay)) throw notFound()
  },
  head: () =>
    pageHead(TITLE, DESCRIPTION, {
      noindex: urlLevel(CONTENT_URL) !== 'public',
      path: PHARMACY_FIND_HREF,
    }),
  component: () => (
    <PageShell>
      <FindOpenPharmacyPage />
    </PageShell>
  ),
})
