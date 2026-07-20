import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import { isUrlVisible } from '../../../content/registry'
import { PageShell } from '../../../components/PageShell'
import { deriveVisibilityOverlay } from '../../../lib/service-status'
import { META } from './-meta'

// Layout for the Find an emergency shelter pages: provides the page chrome
// (breadcrumbs + "Was this helpful?") once around every leaf, and gates the
// whole subtree on the feature's rollout visibility (a level above the
// viewer's hides it).
export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-emergency-shelter',
)({
  beforeLoad: ({ context }) => {
    const overlay = deriveVisibilityOverlay(context.serviceStatuses)
    if (!isUrlVisible(META.url, context.level, overlay)) throw notFound()
  },
  component: () => (
    <PageShell>
      <Outlet />
    </PageShell>
  ),
})
