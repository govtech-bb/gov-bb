import { useEffect } from 'react'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import {
  CONTENT_API_UNREACHABLE,
  ContentRouteError,
} from '../components/ContentRouteError'
import { MarkdownContent } from '../components/markdown'
import { getPage } from '../lib/content-api'
import { trackEvent } from '../lib/analytics'
import { seoTags } from '../lib/page-head'
import {
  buildBreadcrumbLd,
  buildGovernmentServiceLd,
  jsonLd,
} from '../lib/structured-data'
import { pageViewEvent } from './-page-view-event'

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
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { frontmatter, url, breadcrumbs } = loaderData
    const title = frontmatter.title
    const seo = seoTags(title, frontmatter.description ?? '', `/${url}`)
    return {
      meta: [
        { title },
        ...(frontmatter.description
          ? [{ name: 'description', content: frontmatter.description }]
          : []),
        ...seo.meta,
      ],
      links: seo.links,
      scripts: [
        {
          type: 'application/ld+json',
          children: jsonLd(
            buildGovernmentServiceLd({
              title,
              description: frontmatter.description,
              url,
            }),
          ),
        },
        {
          type: 'application/ld+json',
          children: jsonLd(buildBreadcrumbLd(breadcrumbs)),
        },
      ],
    }
  },
  errorComponent: ContentRouteError,
  component: RouteComponent,
})

function RouteComponent() {
  const page = Route.useLoaderData()
  useEffect(() => {
    const event = pageViewEvent(page)
    if (event) trackEvent(event.name, event.data)
  }, [page])
  return (
    <div className="govbb-width-container govbb-main-wrapper">
      <MarkdownContent frontmatter={page.frontmatter} hast={page.hast} />
    </div>
  )
}
