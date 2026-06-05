import type { ReactNode } from 'react'
import { Breadcrumbs } from './Breadcrumbs'
import { HelpfulBox } from './HelpfulBox'

/**
 * Page chrome for component-backed routes (the shelter and StormReady pages):
 * breadcrumbs above the body and the "Was this helpful?" box below it, in the
 * same containers the markdown catch-all route uses. Keeps these routes
 * visually consistent with the content pages without going through markdown.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="container py-4 lg:py-6">
        <Breadcrumbs />
      </div>
      <div className="container pt-4 pb-8 lg:py-8">{children}</div>
      <div className="container">
        <HelpfulBox className="mb-4 lg:mb-16" />
      </div>
    </>
  )
}
