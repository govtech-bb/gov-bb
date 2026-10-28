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

  // The root's category tree (ADR 0078), read once per QueryClient; absent
  // only outside the app's root route, where the static taxonomy applies.
  const categoryTree = useMatches({
    select: (matches) => matches[0]?.context.categoryTree,
  })

  // An api_v2 page's own trail, when the deepest loaded route carries one.
  const trail = useMatches({
    select: (matches) => {
      const match = matches.at(-1)

      if (mode !== 'location' || match?.routeId !== '/$') return undefined

      const data = match.loaderData

      return data?.kind === 'page' || data?.kind === 'api-category'
        ? data.breadcrumbs
        : undefined
    },
  })
  const pathname = mode === 'preview' ? previewPath : undefined
  const showBreadcrumbs =
    mode === 'location' || (mode === 'preview' && previewPath !== undefined)

  return (
    <PreviewBreadcrumbPathContext.Provider value={setPreviewPath}>
      {showBreadcrumbs ? (
        <div className="govbb-width-container pt-4 print:hidden lg:pt-6">
          <Breadcrumbs
            pathname={pathname}
            categoryTree={categoryTree}
            trail={trail}
          />
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
