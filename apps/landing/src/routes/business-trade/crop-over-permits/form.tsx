import { createFileRoute } from '@tanstack/react-router'
import { CropOverPermitsForm } from './-ui/CropOverPermitsForm'
import { gateOnContentUrl } from '@/lib/content-gate'
import { pageHead } from '../../../lib/page-head'

const CONTENT_URL = 'business-trade/crop-over-permits'

export const Route = createFileRoute('/business-trade/crop-over-permits/form')({
  // Mirror the service page's rollout gate: hidden unless the viewer's level
  // meets the service's, reachable with the matching token. The runtime
  // service_status overlay can gate it too (a `disabled` service 404s here).
  beforeLoad: ({ context }) => gateOnContentUrl(CONTENT_URL, context),
  head: ({ match }) =>
    pageHead(
      'Find the permits you need for a Crop Over event',
      'Answer a few questions and get a tailored checklist of the permits you need to run a Crop Over event in Barbados.',
      { noindex: match.context.serviceLevel !== 'public' },
    ),
  component: CropOverPermitsForm,
})
