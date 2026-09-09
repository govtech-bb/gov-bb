import { createFileRoute, notFound } from '@tanstack/react-router'
import { PageShell } from '../../../components/PageShell'
import { isUrlVisible, urlLevel } from '../../../content/registry'
import { pageHead } from '../../../lib/page-head'
import { deriveVisibilityOverlay } from '../../../lib/service-status'
import { SITE_URL } from '../../../lib/site-url'
import { PHARMACY_CONTENT } from './-data/pharmacies'
import { formatCopy } from './-lib/copy'
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
  beforeLoad: ({ context }) => {
    const overlay = deriveVisibilityOverlay(context.serviceStatuses)
    if (!isUrlVisible(CONTENT_URL, context.level, overlay)) throw notFound()
    return { pharmacyServiceLevel: urlLevel(CONTENT_URL, overlay) }
  },
  loader: ({ params }) => {
    const pharmacy = findPharmacyBySlug(params.slug)
    if (!pharmacy) throw notFound()
    return pharmacy
  },
  head: ({ params, loaderData: pharmacy, match }) => {
    const isPublic = match.context.pharmacyServiceLevel === 'public'
    const path = `/${CONTENT_URL}/${params.slug}`
    const head = pageHead(
      pharmacy?.name ?? PHARMACY_CONTENT.copy.detail.fallbackTitle,
      pharmacy
        ? formatCopy(PHARMACY_CONTENT.copy.detail.metadataDescription, {
            name: pharmacy.name,
            parish: pharmacy.parish,
          })
        : PHARMACY_CONTENT.copy.detail.fallbackDescription,
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
