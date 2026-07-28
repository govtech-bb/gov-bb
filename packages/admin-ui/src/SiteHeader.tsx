import type { ReactNode } from 'react'
import { Logo } from '@govtech-bb/react'

/**
 * Compact blue site bar shared by the platform's internal admin tools: the
 * Government of Barbados wordmark + a short app label on the left, and a
 * right-aligned slot (`children`) for page-specific controls. Presentational
 * and router-agnostic — the wordmark links home via a plain anchor so the
 * component couples to no particular router.
 *
 * The design tokens/utility classes it uses (`bg-blue-00`, `container`,
 * `text-caption`, spacing) must be provided by the consuming app's Tailwind +
 * `@govtech-bb/design` setup, and the app's CSS must `@source` this package so
 * these classes are generated.
 */
export function SiteHeader({
  label,
  homeHref = '/',
  children,
}: {
  label: string
  homeHref?: string
  children?: ReactNode
}) {
  return (
    <div className="bg-blue-00 text-white-00">
      <div className="container flex h-16 items-center gap-m">
        <a
          href={homeHref}
          className="flex items-center gap-s focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-100"
        >
          <Logo className="h-7 w-auto text-white-00" />
          <span aria-hidden="true" className="h-4 w-px bg-blue-40/60" />
          <span className="font-normal text-blue-40 text-caption">{label}</span>
        </a>
        {children ? (
          <div className="ml-auto flex items-center gap-s text-caption">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  )
}
