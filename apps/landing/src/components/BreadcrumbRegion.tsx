import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useMatches } from '@tanstack/react-router'
import { Breadcrumbs } from './Breadcrumbs'

type BreadcrumbMode = 'location' | 'preview'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    breadcrumbMode?: BreadcrumbMode
  }
}

const PreviewBreadcrumbPathContext = createContext<
  ((pathname: string | undefined) => void) | null
>(null)

/**
 * Keeps breadcrumb navigation between the site header and main landmark while
 * letting routes declare whether their trail follows the browser location or
 * a previewed page path.
 */
export function BreadcrumbRegion({ children }: { children: ReactNode }) {
  const [previewPath, setPreviewPath] = useState<string>()
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
  const pathname = mode === 'preview' ? previewPath : undefined
  const showBreadcrumbs =
    mode === 'location' || (mode === 'preview' && previewPath !== undefined)

  return (
    <PreviewBreadcrumbPathContext.Provider value={setPreviewPath}>
      {showBreadcrumbs ? (
        <div className="govbb-width-container py-4 print:hidden lg:py-6">
          <Breadcrumbs pathname={pathname} />
        </div>
      ) : null}
      {children}
    </PreviewBreadcrumbPathContext.Provider>
  )
}

/** Register the would-be public path displayed by the start-page preview. */
export function usePreviewBreadcrumbPath(pathname: string | undefined) {
  const setPreviewPath = useContext(PreviewBreadcrumbPathContext)

  useEffect(() => {
    if (!setPreviewPath) {
      throw new Error(
        'usePreviewBreadcrumbPath must be used inside BreadcrumbRegion',
      )
    }

    setPreviewPath(pathname)
    return () => setPreviewPath(undefined)
  }, [pathname, setPreviewPath])
}
