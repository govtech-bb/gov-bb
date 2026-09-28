import { createFileRoute } from '@tanstack/react-router'
import { MarkdownContent } from '../components/markdown'
import { getPage } from '../lib/content-api'

export const Route = createFileRoute('/$')({
  loader: ({ params }) => getPage({ data: params._splat ?? '' }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.frontmatter.title }],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const page = Route.useLoaderData()
  return (
    <div className="govbb-width-container govbb-main-wrapper">
      <MarkdownContent frontmatter={page.frontmatter} hast={page.hast} />
    </div>
  )
}
