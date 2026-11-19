import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { Breadcrumbs as GovBreadcrumbs } from '@govtech-bb/react'
import { Link, useLocation } from '@tanstack/react-router'
import type { CategoryTreeResult } from '../lib/api-v2-categories'
import { ancestorTrail } from '../lib/breadcrumb-trail'
import type { Crumb } from '../lib/breadcrumb-trail'

type BreadcrumbLinkProps = ComponentPropsWithoutRef<'a'> & { href: string }

const BreadcrumbLink = forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  ({ href, ...props }, ref) => {
    const depth = href === '/' ? 0 : href.split('/').filter(Boolean).length

    return (
      <Link
        ref={ref}
        to={href}
        {...props}
        data-umami-event="breadcrumb"
        data-umami-event-to={href}
        data-umami-event-depth={depth}
      />
    )
  },
)
BreadcrumbLink.displayName = 'BreadcrumbLink'

const STATIC_CATEGORIES: CategoryTreeResult = { kind: 'disabled' }

export function Breadcrumbs({
  pathname: pathnameOverride,
  categoryTree = STATIC_CATEGORIES,
  trail,
}: {
  /** Render the trail for this path instead of the current location — used by
   *  the /preview-start-page route to show the previewed page's crumbs. */
  pathname?: string
  /** Where category labels come from: api_v2's tree, or the static taxonomy. */
  categoryTree?: CategoryTreeResult
  /** The route's own whole trail, current page last (an api_v2 page's). */
  trail?: readonly Crumb[]
} = {}) {
  const { pathname: locationPathname } = useLocation()
  const pathname = pathnameOverride ?? locationPathname
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null

  if (segments.includes('form')) return null

  const crumbs = trail
    ? trail.slice(0, -1)
    : ancestorTrail(pathname, categoryTree)

  const items = [
    { href: '/', label: 'Home' },
    ...crumbs.map((crumb) => ({ href: crumb.url, label: crumb.name })),
  ]

  return (
    <GovBreadcrumbs
      items={items}
      collapseOnMobile
      linkComponent={BreadcrumbLink}
    />
  )
}
