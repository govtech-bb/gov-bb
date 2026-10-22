import { createFileRoute, notFound } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { OrgBand } from '../../../components/org/OrgBand'
import { OrgHero } from '../../../components/org/OrgHero'
import { pageHead } from '../../../lib/page-head'
import { ORG_BY_SLUG } from './-orgs'

export const Route = createFileRoute('/government/organisations/$slug')({
  loader: ({ params }) => {
    const org = ORG_BY_SLUG.get(params.slug)
    if (!org) throw notFound()
    return org
  },
  head: ({ loaderData: org }) =>
    pageHead(org?.hero.name ?? 'Organisation', org?.hero.lede ?? '', {
      noindex: true,
    }),
  component: OrganisationPage,
})

// No breadcrumbMode: the hero renders the trail inside its band.
function OrganisationPage() {
  const org = Route.useLoaderData()
  return (
    <div
      style={org.theme as CSSProperties}
      className="[--govbb-link-color:var(--org-link)]"
    >
      <OrgHero {...org.hero} />
      {org.sections.map((section) => (
        <OrgBand key={section.title} section={section} contact={org.contact} />
      ))}
    </div>
  )
}
