import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { Link } from '@tanstack/react-router'
import { Header as GovHeader, OfficialBanner } from '@govtech-bb/react'
import { StageBanner } from './StageBanner'

// The DS Header renders links via `href`; map it to TanStack Router's `to` for
// client-side navigation, and forward the ref so focus management keeps working.
type RouterLinkProps = ComponentPropsWithoutRef<'a'> & { href: string }
const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(
  ({ href, ...props }, ref) => <Link ref={ref} to={href} {...props} />,
)
RouterLink.displayName = 'RouterLink'

const NAV_ITEMS = [{ label: 'Services', href: '/services' }]

export default function Header() {
  return (
    <div>
      <OfficialBanner
        imageSrc="/images/coat-of-arms.png"
        imageAlt=""
        showLearnMore={false}
      />
      <div className="bg-blue-10">
        <div className="container">
          <StageBanner stage="alpha" />
        </div>
      </div>
      <GovHeader
        homeHref="/"
        homeLabel="Go to the alpha.gov.bb homepage"
        navItems={NAV_ITEMS}
        linkComponent={RouterLink}
      />
    </div>
  )
}
