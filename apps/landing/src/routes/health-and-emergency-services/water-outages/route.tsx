import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import { isUrlVisible } from '../../../content/registry'
import { PageShell } from '../../../components/PageShell'
import { deriveVisibilityOverlay } from '../../../lib/service-status'
import { META } from './-meta'

// Layout for the water-outages pages: shared page chrome once around every
// leaf, gated on the feature's rollout visibility.
export const Route = createFileRoute(
  '/health-and-emergency-services/water-outages',
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
