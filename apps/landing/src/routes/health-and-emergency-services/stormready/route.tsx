import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import { isUrlPreview } from '../../../content/registry'
import { PageShell } from '../../../components/PageShell'
import { META } from './-meta'

// Layout for the StormReady pages: provides the page chrome (breadcrumbs +
// "Was this helpful?") once around every leaf, and gates the whole subtree on
// the feature's rollout visibility (preview hides it).
export const Route = createFileRoute(
  '/health-and-emergency-services/stormready',
)({
  beforeLoad: ({ context }) => {
    if (!context.preview && isUrlPreview(META.url)) throw notFound()
  },
  component: () => (
    <PageShell>
      <Outlet />
    </PageShell>
  ),
})
