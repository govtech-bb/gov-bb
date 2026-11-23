import {
  createFileRoute,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { gateOnContentUrl } from '@/lib/content-gate'
import { pageHead } from '../../../lib/page-head'
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
  beforeLoad: ({ context }) => gateOnContentUrl(META.url, context),
  loader: () => getWaterOutages(),
  head: ({ match }) =>
    pageHead(META.title, META.description, {
      noindex: match.context.serviceLevel !== 'public',
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
