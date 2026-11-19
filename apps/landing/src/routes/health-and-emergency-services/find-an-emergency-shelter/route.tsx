import { createFileRoute, Outlet } from '@tanstack/react-router'
import { PageShell } from '../../../components/PageShell'
import { gateOnContentUrl } from '@/lib/content-gate'
import { META } from './-meta'

// Layout for the Find an emergency shelter pages: provides the page chrome
// (breadcrumbs + "Was this helpful?") once around every leaf, and gates the
// whole subtree on the feature's rollout visibility (a level above the
// viewer's hides it). The level it returns reaches each leaf's `head` as
// `match.context.serviceLevel`, so the leaves' `noindex` matches the 404
// check (#3788).
export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-emergency-shelter',
)({
  staticData: { breadcrumbMode: 'location' },
  beforeLoad: ({ context }) => gateOnContentUrl(META.url, context),
  component: () => (
    <PageShell>
      <Outlet />
    </PageShell>
  ),
})
