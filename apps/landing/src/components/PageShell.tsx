import type { ReactNode } from 'react'
import { Breadcrumbs } from './Breadcrumbs'
import { HelpfulBox } from './HelpfulBox'

/**
 * Standard page chrome for content/category pages: breadcrumbs, the content in
 * a container, and the "was this helpful" box. `pathname` overrides the route
 * location for breadcrumbs (used by the live-preview route, where the location
 * is `/preview` but the breadcrumbs should reflect the real page URL).
 */
export function PageShell({
  children,
  pathname,
}: {
  children: ReactNode
  pathname?: string
}) {
  return (
    <>
      <div className="container py-4 lg:py-6">
        <Breadcrumbs pathname={pathname} />
      </div>
      <div className="container pt-4 pb-8 lg:py-8">{children}</div>
      <div className="container">
        <HelpfulBox className="mb-4 lg:mb-16" />
      </div>
    </>
  )
}
