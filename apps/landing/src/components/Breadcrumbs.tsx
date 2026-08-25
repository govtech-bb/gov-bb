import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { Breadcrumbs as GovBreadcrumbs } from '@govtech-bb/react'
import { Link, useLocation } from '@tanstack/react-router'
import {
  getCategoryTitle,
  getPageTitle,
  getSubcategoryTitle,
} from '../content/registry'

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

function titleCase(slug: string): string {
  const raw = slug.replace(/-/g, ' ')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function titleForSegment(seg: string, previousSegment?: string): string {
  const subTitle = previousSegment
    ? getSubcategoryTitle(previousSegment, seg)
    : undefined
  return (
    getCategoryTitle(seg) ?? subTitle ?? getPageTitle(seg) ?? titleCase(seg)
  )
}

export function Breadcrumbs({
  pathname: pathnameOverride,
}: {
  /** Render the trail for this path instead of the current location — used by
   *  the /preview-start-page route to show the previewed page's crumbs. */
  pathname?: string
} = {}) {
  const { pathname: locationPathname } = useLocation()
  const pathname = pathnameOverride ?? locationPathname
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return null

  if (segments.includes('form')) return null

  const crumbs = segments.slice(0, -1)
  const items = [
    { href: '/', label: 'Home' },
    ...crumbs.map((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join('/')}`
      return {
        href,
        label: titleForSegment(segment, crumbs[index - 1]),
      }
    }),
  ]

  return (
    <GovBreadcrumbs
      items={items}
      collapseOnMobile
      linkComponent={BreadcrumbLink}
    />
  )
}
