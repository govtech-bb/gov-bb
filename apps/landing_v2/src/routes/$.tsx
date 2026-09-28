import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { ErrorPage } from '../components/ErrorPage'
import { MarkdownContent } from '../components/markdown'
import { ServerErrorPage } from '../components/ServerErrorPage'
import { getPage } from '../lib/content-api'

/** Thrown when the content API is down and the URL has no cached copy. */
const CONTENT_API_UNREACHABLE = 'content API unreachable'

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
  errorComponent: RouteError,
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

// Matched on the message, not a class: the error is serialised to the client
// on SSR and a subclass would not survive hydration.
function RouteError({ error }: ErrorComponentProps) {
  if (error.message !== CONTENT_API_UNREACHABLE) return <ServerErrorPage />
  return (
    <ErrorPage
      title="This service is temporarily unavailable"
      intro="We're performing scheduled maintenance or experiencing unusually high traffic. This service should be back soon."
      suggestions={[
        'Try again in a few minutes',
        'Return to the homepage to access other services',
        'Contact us for urgent enquiries',
      ]}
      primary={{ label: 'Return to homepage', href: '/' }}
    />
  )
}
