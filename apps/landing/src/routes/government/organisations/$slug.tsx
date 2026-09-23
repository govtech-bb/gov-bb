import { createFileRoute, notFound } from '@tanstack/react-router'
import { pageHead } from '../../../lib/page-head'
import { OrgPage } from './-ui/org-page'

export const Route = createFileRoute('/government/organisations/$slug')({
  staticData: { breadcrumbMode: 'location' },
  loader: async ({ params }) => {
    // Loaders aren't code-split, so a static import would put all 152 pages in
    // the entry chunk every page downloads.
    const { ORG_BY_SLUG } = await import('./-lib/orgs')
    const org = ORG_BY_SLUG.get(params.slug)
    if (!org) throw notFound()
    return org
  },
  head: ({ loaderData: org }) =>
    pageHead(org?.name ?? 'Organisation', org?.shortDescription ?? '', {
      noindex: true,
    }),
  component: OrganisationDetail,
})

function OrganisationDetail() {
  return <OrgPage org={Route.useLoaderData()} />
}
