import type { ReactNode } from 'react'

/** A bordered callout for a key note (e.g. the hurricane-season window). */
export function Notice({ children }: { children: ReactNode }) {
  // No inner <p>: the block child already arrives as a paragraph. Wrapping
  // again produces invalid nested <p><p>.
  return (
    <div className="border-blue-40 border-l-4 bg-blue-10 px-s py-xm">
      {children}
    </div>
  )
}
