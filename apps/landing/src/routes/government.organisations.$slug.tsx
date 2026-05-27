import { createFileRoute, notFound } from '@tanstack/react-router'
import { LexicalBody } from '../components/LexicalContent'
import { MinistryPage } from '../components/MinistryPage'
import { ORG_PAGE_BY_SLUG, resolveOrgProps } from '../content/orgs'

export const Route = createFileRoute('/government/organisations/$slug')({
  loader: ({ params }) => {
    const found = ORG_PAGE_BY_SLUG.get(params.slug)
    if (!found) throw notFound()
    return { ...found, orgSlug: params.slug }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const fm = loaderData.page?.frontmatter
    return {
      meta: [
        ...(fm?.title ? [{ title: fm.title }] : []),
        ...(fm?.description
          ? [{ name: 'description', content: fm.description }]
          : []),
      ],
    }
  },
  component: OrganisationDetail,
})

function OrganisationDetail() {
  const { kind, orgSlug, page } = Route.useLoaderData()
  const props = resolveOrgProps(kind, orgSlug, {
    title: page?.frontmatter.title ?? orgSlug,
    originalSource: page?.frontmatter.source_url,
  })
  return (
    <MinistryPage
      {...props}
      body={page ? <LexicalBody body={page.body} /> : null}
    />
  )
}
