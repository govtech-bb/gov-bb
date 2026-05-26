import { Link, useRouterState } from '@tanstack/react-router'
import { Logo } from '@govtech-bb/react'
import { OfficialBanner } from './OfficialBanner'
import { StageBanner } from './StageBanner'
import { hasMigratedSource, ORG_PATH_PREFIX } from '../content/orgs'

const NAV_ITEMS = [
  { label: 'Home', to: '/' },
  { label: 'Services', to: '/services' },
  { label: 'Organisations', to: '/government/organisations' },
] as const

function orgSlugFromPath(pathname: string): string | null {
  if (!pathname.startsWith(ORG_PATH_PREFIX)) return null
  const slug = pathname.slice(ORG_PATH_PREFIX.length).replace(/^\/+|\/+$/g, '')
  return slug.includes('/') || slug.length === 0 ? null : slug
}

function isActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
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
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4 lg:py-6">
            <Link
              to="/"
              aria-label="Go to the alpha.gov.bb homepage"
              data-umami-event="header-home"
            >
              <Logo aria-hidden="true" className="h-7 w-auto lg:h-9" />
            </Link>
            <nav aria-label="Primary" className="ml-auto">
              <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:gap-x-7">
                {NAV_ITEMS.map((item) => {
                  const active = isActive(location.pathname, item.to)
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={
                          active
                            ? 'text-base font-medium text-blue-100 underline decoration-2 underline-offset-4 transition-colors'
                            : 'text-base font-medium text-black-00 transition-colors hover:text-blue-100'
                        }
                        data-umami-event={`header-${item.label.toLowerCase()}`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </div>
      </header>
    </div>
  )
}
