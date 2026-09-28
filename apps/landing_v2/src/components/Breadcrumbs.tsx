import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { Breadcrumbs as GovBreadcrumbs } from '@govtech-bb/react'
import type { PageResponse } from '@govtech-bb/landing-v2-contract'
import { Link } from '@tanstack/react-router'

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

/** The visible breadcrumb trail: Home plus every crumb except the current
 *  page (the API's trail includes the current page — see structured-data.ts's
 *  buildBreadcrumbLd for the JSON-LD version, which keeps it). */
export function Breadcrumbs({
  breadcrumbs,
}: {
  breadcrumbs: PageResponse['breadcrumbs']
}) {
  if (breadcrumbs.length === 0) return null

  const items = [
    { href: '/', label: 'Home' },
    ...breadcrumbs.slice(0, -1).map((crumb) => ({
      href: `/${crumb.url}`,
      label: crumb.name,
    })),
  ]

  return (
    <GovBreadcrumbs
      items={items}
      collapseOnMobile
      linkComponent={BreadcrumbLink}
    />
  )
}
