import { createFileRoute } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import {
  DESCRIPTION,
  StormReadyChecklistPage,
  TITLE,
} from './-ui/checklist-page'

export const Route = createFileRoute(
  '/health-and-emergency-services/stormready/checklist',
)({
  head: () => pageHead(TITLE, DESCRIPTION),
  component: StormReadyChecklistPage,
})
