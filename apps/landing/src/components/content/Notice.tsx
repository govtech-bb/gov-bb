import type { ReactNode } from 'react'

/** A bordered callout for a key note (e.g. the hurricane-season window). */
export function Notice({ children }: { children: ReactNode }) {
  // No inner <p>: MDX already wraps the block child in a styled paragraph (the
  // `p` override). Wrapping again produces invalid nested <p><p>.
  return (
    <div className="border-blue-100 border-l-4 bg-blue-10 px-s py-xm">
      {children}
    </div>
  )
}
