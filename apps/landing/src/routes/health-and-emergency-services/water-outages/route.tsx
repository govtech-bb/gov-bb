import { createFileRoute, Outlet } from '@tanstack/react-router'
import { PageShell } from '../../../components/PageShell'
import './-ui/water-outages.css'

// Email token pages must remain reachable when the service is in preview.
export const Route = createFileRoute(
  '/health-and-emergency-services/water-outages',
)({
  staticData: { breadcrumbMode: 'location' },
  component: () => (
    <PageShell>
      <Outlet />
    </PageShell>
  ),
})
