import type { ReactNode } from 'react'
import { useMatches } from '@tanstack/react-router'
import { Breadcrumbs } from './Breadcrumbs'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    breadcrumbMode?: 'location'
  }
}

/** Keeps route breadcrumbs between the site header and main landmark. */
export function BreadcrumbRegion({ children }: { children: ReactNode }) {
  const mode = useMatches({
    select: (matches) => {
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const match = matches[index]
        if (match?.status === 'success' && match.staticData.breadcrumbMode) {
          return match.staticData.breadcrumbMode
        }
      }
      return undefined
    },
  })

  return (
    <>
      {mode === 'location' ? (
        <div className="govbb-width-container pt-4 print:hidden lg:pt-6">
          <Breadcrumbs />
        </div>
      ) : null}
      {children}
    </>
  )
}
