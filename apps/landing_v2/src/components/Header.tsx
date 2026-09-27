import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Header as GovHeader,
  Link as GovLink,
  OfficialBanner,
  StatusBanner,
} from '@govtech-bb/react'
import govBbLogoUrl from '@govtech-bb/frontend/assets/images/govbb-logo.svg?url'

// The DS Header renders links via `href`; map it to TanStack Router's `to` for
// client-side navigation, and forward the ref so focus management keeps working.
type RouterLinkProps = ComponentPropsWithoutRef<'a'> & { href: string }
const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(
  ({ href, ...props }, ref) => (
    // @ts-expect-error — with zero leaf routes (Session 1 has only the root),
    // TanStack Router's `ParseRoute<routeTree>` union is empty, so `Link`'s
    // generic `to` resolution falls back to a `never` search schema and
    // treats `search` as required here. Remove once a real route exists.
    <Link ref={ref} to={href} {...props} />
  ),
)
RouterLink.displayName = 'RouterLink'

export default function Header() {
  return (
    <>
      <OfficialBanner
        imageSrc="/images/coat-of-arms.png"
        imageAlt=""
        showLearnMore={false}
      />
      <GovHeader
        homeHref="/"
        logoAlt="Go to the alpha.gov.bb homepage"
        logoSrc={govBbLogoUrl}
        linkComponent={RouterLink}
        nav={
          <GovLink href="/services" linkComponent={RouterLink}>
            Services
          </GovLink>
        }
        navAriaLabel="Primary navigation"
      />
      <StatusBanner variant="alpha" fullWidth>
        <p>
          This page is in{' '}
          <GovLink href="/what-we-mean-by-alpha" linkComponent={RouterLink}>
            Alpha
          </GovLink>
          .
        </p>
      </StatusBanner>
    </>
  )
}
