import { createFileRoute, notFound } from '@tanstack/react-router'
import { PageShell } from '../../../components/PageShell'
import { gateOnContentUrl } from '@/lib/content-gate'
import { pageHead } from '../../../lib/page-head'
import { SITE_URL } from '../../../lib/site-url'
import { pharmacyJsonLd } from './-lib/json-ld'
import { findPharmacyBySlug } from './-lib/pharmacy-slug'
import { PharmacyDetailPage } from './-ui/detail-page'

const CONTENT_URL = 'health-and-emergency-services/find-an-open-pharmacy'

export const Route = createFileRoute(
  '/health-and-emergency-services/find-an-open-pharmacy/$slug',
)({
  staticData: { breadcrumbMode: 'location' },
  // Mirror the markdown service page's rollout gate, then resolve the
  // pharmacy - unknown slugs 404.
  beforeLoad: ({ context }) => gateOnContentUrl(CONTENT_URL, context),
  loader: ({ params }) => {
    const pharmacy = findPharmacyBySlug(params.slug)
    if (!pharmacy) throw notFound()
    return pharmacy
  },
  head: ({ params, loaderData: pharmacy, match }) => {
    const isPublic = match.context.serviceLevel === 'public'
    const path = `/${CONTENT_URL}/${params.slug}`
    const head = pageHead(
      pharmacy?.name ?? 'Pharmacy',
      pharmacy
        ? `Opening hours, phone number and directions for ${pharmacy.name}, ${pharmacy.parish}, Barbados.`
        : 'Pharmacy details.',
      { noindex: !isPublic, path },
    )
    if (!pharmacy || !isPublic) return head
    return {
      ...head,
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify(
            pharmacyJsonLd(pharmacy, `${SITE_URL}${path}`),
          ),
        },
      ],
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const pharmacy = Route.useLoaderData()
  return (
    <PageShell>
      <PharmacyDetailPage pharmacy={pharmacy} />
    </PageShell>
  )
}
