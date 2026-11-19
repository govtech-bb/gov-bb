import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import { META } from './-meta'
import { EmergencyShelterLandingPage } from './-ui/landing-page'

export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-emergency-shelter/',
)({
  head: ({ match }) =>
    pageHead(META.title, META.description, {
      noindex: match.context.serviceLevel !== 'public',
    }),
  component: EmergencyShelterLandingPage,
})
