import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import { META } from './-meta'
import { StormReadyLandingPage } from './-ui/landing-page'

export const Route = createFileRoute(
  '/health-and-emergency-services/stormready/',
)({
  head: () => pageHead(META.title, META.description),
  component: StormReadyLandingPage,
})
