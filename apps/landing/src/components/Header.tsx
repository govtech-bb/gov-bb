import { useEffect, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Button, Logo, Link as GovLink, OfficialBanner } from '@govtech-bb/react'
import { StageBanner } from './StageBanner'

const NAV_ITEMS = [{ label: 'Services', to: '/services' }] as const

export default function Header() {
  const { location } = useRouterState()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstNavLinkRef = useRef<HTMLAnchorElement>(null)

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // Close on Escape, return focus to trigger
  useEffect(() => {
    if (!menuOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  // Move focus to first nav link when panel opens
  useEffect(() => {
    if (menuOpen) firstNavLinkRef.current?.focus()
  }, [menuOpen])

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
      <header className="relative bg-yellow-100">
        <div className="container">
          <div className="flex items-center gap-x-6 py-4 lg:py-6">
            <Link
              to="/"
              aria-label="Go to the alpha.gov.bb homepage"
              data-umami-event="header-home"
            >
              <Logo aria-hidden="true" className="h-7 w-auto lg:h-9" />
            </Link>

            {/* Desktop nav — hidden below 640px */}
            <nav aria-label="Primary" className="ml-auto hidden min-[640px]:block">
              <ul className="flex items-center gap-x-5 lg:gap-x-7">
                {NAV_ITEMS.map((item) => (
                  <li key={item.to} className="flex">
                    <GovLink
                      href={item.to}
                      variant="secondary"
                      className="flex items-center font-bold no-underline"
                      data-umami-event={`header-${item.label.toLowerCase()}`}
                    >
                      {item.label}
                    </GovLink>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Mobile menu button — hidden at 640px and above */}
                <Button
                  ref={menuButtonRef}
                  type="button"
                  variant="link"
                  aria-expanded={menuOpen}
                  aria-controls="mobile-nav"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="ml-auto flex min-h-11 items-center text-base font-semibold text-black-00 hover:text-black-00! min-[640px]:hidden no-underline"
                >
                  Menu
                </Button>
          </div>
        </div>

        {/* Mobile nav disclosure panel */}
        {menuOpen && (
          <nav id="mobile-nav" aria-label="Primary mobile" className="bg-blue-10 min-[640px]:hidden">
            <ul className="container flex flex-col gap-s py-s">
              {NAV_ITEMS.map((item, i) => (
                <li key={item.to} className="flex text-caption font-bold">
                  <GovLink
                    ref={i === 0 ? firstNavLinkRef : undefined}
                    href={item.to}
                    className="flex items-center no-underline"
                    data-umami-event={`header-mobile-${item.label.toLowerCase()}`}
                  >
                    {item.label}
                  </GovLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
    </div>
  )
}
