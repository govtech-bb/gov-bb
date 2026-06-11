import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import { DESCRIPTION, FindEmergencyShelterPage, TITLE } from './-ui/find-page'

export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-emergency-shelter/find',
)({
  head: () => pageHead(TITLE, DESCRIPTION),
  component: FindEmergencyShelterPage,
})
