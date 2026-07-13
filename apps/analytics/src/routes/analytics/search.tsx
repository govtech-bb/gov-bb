import { createFileRoute } from '@tanstack/react-router'
import { ComingSoon } from '../../components/ComingSoon'

export const Route = createFileRoute('/analytics/search')({
  component: () => <ComingSoon title="Search" />,
})
