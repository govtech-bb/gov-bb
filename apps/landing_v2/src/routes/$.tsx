import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import {
  CONTENT_API_UNREACHABLE,
  ContentRouteError,
} from '../components/ContentRouteError'
import { MarkdownContent } from '../components/markdown'
import { getPage } from '../lib/content-api'

export const Route = createFileRoute('/$')({
  loader: async ({ params }) => {
    const result = await getPage({ data: params._splat ?? '' })
    switch (result.kind) {
      case 'page':
        return result.page
      case 'redirect':
        throw redirect({ href: result.to, statusCode: 301 })
      case 'not-found':
        throw notFound()
      case 'unavailable':
        // `getPage` has already set the 503; `src/start.ts` keeps it.
        throw new Error(CONTENT_API_UNREACHABLE)
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.frontmatter.title }],
  }),
  errorComponent: ContentRouteError,
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
