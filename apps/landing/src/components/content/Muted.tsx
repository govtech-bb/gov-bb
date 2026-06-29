import type { ReactNode } from 'react'

/**
 * A muted (grey) block — a section intro or a note. Renders a wrapper so the
 * markdown inside keeps its own paragraph, inheriting the grey colour rather
 * than nesting a second `<p>`.
 */
export function Muted({ children }: { children: ReactNode }) {
  return <div className="text-mid-grey-00">{children}</div>
}
