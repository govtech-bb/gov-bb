import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import { isUrlVisible } from '../../../content/registry'
import { PageShell } from '../../../components/PageShell'
import { getServiceStatuses } from '../../../lib/service-status'
import { META } from './-meta'

// Layout for the Find an emergency shelter pages: provides the page chrome
// (breadcrumbs + "Was this helpful?") once around every leaf, and gates the
// whole subtree on the feature's rollout visibility (a level above the
// viewer's hides it). Also fetches the service_status overrides (#1897,
// cached — see lib/service-status.ts) so an admin's enabled/disabled toggle
// takes effect without a redeploy.
export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-emergency-shelter',
)({
  beforeLoad: async ({ context }) => {
    const statusOverrides = await getServiceStatuses()
    if (!isUrlVisible(META.url, context.level, statusOverrides))
      throw notFound()
  },
  component: () => (
    <PageShell>
      <Outlet />
    </PageShell>
  ),
})
