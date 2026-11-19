import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import {
  DESCRIPTION,
  EmergencyShelterGuidancePage,
  TITLE,
} from './-ui/guidance-page'

export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-emergency-shelter/guidance',
)({
  head: ({ match }) =>
    pageHead(TITLE, DESCRIPTION, {
      noindex: match.context.serviceLevel !== 'public',
    }),
  component: EmergencyShelterGuidancePage,
})
