import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import { META } from './-meta'
import { EmergencyShelterLandingPage } from './-ui/landing-page'

export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-emergency-shelter/',
)({
  head: () => pageHead(META.title, META.description),
  component: EmergencyShelterLandingPage,
})
