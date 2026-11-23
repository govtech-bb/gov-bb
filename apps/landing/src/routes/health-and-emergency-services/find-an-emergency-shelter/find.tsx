import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import { DESCRIPTION, FindEmergencyShelterPage, TITLE } from './-ui/find-page'

export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-emergency-shelter/find',
)({
  head: ({ match }) =>
    pageHead(TITLE, DESCRIPTION, {
      noindex: match.context.serviceLevel !== 'public',
    }),
  component: FindEmergencyShelterPage,
})
