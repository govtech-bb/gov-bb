import { Logo } from '@govtech-bb/react'
import { OfficialBanner } from './OfficialBanner'
import { StageBanner } from './StageBanner'

const LANDING_ORIGIN = 'https://alpha.gov.bb'

const NAV_ITEMS = [
  { label: 'Home', href: `${LANDING_ORIGIN}/` },
  { label: 'Services', href: `${LANDING_ORIGIN}/services` },
  {
    label: 'Organisations',
    href: `${LANDING_ORIGIN}/government/organisations`,
  },
] as const

export default function Header() {
  return (
    <div>
      <OfficialBanner />
      <div className="bg-blue-10">
        <div className="container">
          <StageBanner stage="alpha" />
        </div>
      </div>
      <header className="relative bg-yellow-100">
        <div className="container">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4 lg:py-6">
            <a
              href={`${LANDING_ORIGIN}/`}
              aria-label="Go to the alpha.gov.bb homepage"
            >
              <Logo aria-hidden="true" className="h-7 w-auto lg:h-9" />
            </a>
            <nav aria-label="Primary" className="ml-auto">
              <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:gap-x-7">
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="text-base font-medium text-black-00 transition-colors hover:text-blue-100"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </header>
    </div>
  )
}
