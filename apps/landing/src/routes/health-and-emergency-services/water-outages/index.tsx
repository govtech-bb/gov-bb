import {
  createFileRoute,
  notFound,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { isUrlVisible, urlLevel } from '../../../content/registry'
import { pageHead } from '../../../lib/page-head'
import { deriveVisibilityOverlay } from '../../../lib/service-status'
import { META } from './-meta'
import { findParish } from './-lib/parishes'
import { getWaterOutages } from './-lib/water-alerts'
import { WaterOutagesPage } from './-ui/outages-page'

export const Route = createFileRoute(
  '/health-and-emergency-services/water-outages/',
)({
  validateSearch: (search: Record<string, unknown>) => ({
    parish:
      typeof search.parish === 'string' && findParish(search.parish)
        ? search.parish
        : undefined,
  }),
  beforeLoad: ({ context }) => {
    const overlay = deriveVisibilityOverlay(context.serviceStatuses)
    if (!isUrlVisible(META.url, context.level, overlay)) throw notFound()
    return { waterServiceLevel: urlLevel(META.url, overlay) }
  },
  loader: () => getWaterOutages(),
  head: ({ match }) =>
    pageHead(META.title, META.description, {
      noindex: match.context.waterServiceLevel !== 'public',
      path: `/${META.url}`,
    }),
  component: WaterOutagesRoute,
})

function WaterOutagesRoute() {
  const data = Route.useLoaderData()
  const { parish } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const retrying = useRouterState({ select: (state) => state.isLoading })
  return (
    <WaterOutagesPage
      data={data}
      selected={parish ?? ''}
      onSelect={(value) => {
        void navigate({
          search: { parish: value || undefined },
          resetScroll: false,
        })
      }}
      onRetry={() => {
        void router.invalidate()
      }}
      retrying={retrying}
    />
  )
}
