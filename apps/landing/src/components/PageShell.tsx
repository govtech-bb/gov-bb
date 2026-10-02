import type { ReactNode } from 'react'
import { HelpfulBox } from './HelpfulBox'

/**
 * Page chrome for component-backed routes (the shelter and StormReady pages):
 * the body and the "Was this helpful?" box below it, in the same containers
 * the markdown catch-all route uses. Breadcrumbs live in the root layout so
 * the skip link bypasses them.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="govbb-width-container govbb-main-wrapper">{children}</div>
      <div className="govbb-width-container">
        <HelpfulBox className="mb-4 lg:mb-16" />
      </div>
    </>
  )
}
