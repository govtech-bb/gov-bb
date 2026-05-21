import { Link, useRouterState } from '@tanstack/react-router'
import { Logo } from '@govtech-bb/react'
import { OfficialBanner } from './OfficialBanner'
import { StageBanner } from './StageBanner'
import { hasMigratedSource, ORG_PATH_PREFIX } from '../content/orgs'

function orgSlugFromPath(pathname: string): string | null {
  if (!pathname.startsWith(ORG_PATH_PREFIX)) return null
  const slug = pathname.slice(ORG_PATH_PREFIX.length).replace(/^\/+|\/+$/g, '')
  return slug.includes('/') || slug.length === 0 ? null : slug
}

export default function Header() {
  const { location } = useRouterState()
  const slug = orgSlugFromPath(location.pathname)
  const hideAlpha = slug ? hasMigratedSource(slug) : false

  return (
    <div>
      <OfficialBanner />
      {hideAlpha ? null : (
        <div className="bg-blue-10">
          <div className="container">
            <StageBanner stage="alpha" />
          </div>
        </div>
      )}
      <header className="relative bg-yellow-100">
        <div className="container">
          <div className="flex items-center gap-3 py-4 lg:py-6">
            <Link
              to="/"
              aria-label="Go to the alpha.gov.bb homepage"
              data-umami-event="header-home"
            >
              <Logo aria-hidden="true" className="h-7 w-auto lg:h-9" />
            </Link>
          </div>
        </div>
      </header>
    </div>
  )
}
