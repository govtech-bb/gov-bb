import type { ReactNode } from 'react'
import { Text } from '@govtech-bb/react'

/**
 * A muted (grey) paragraph. `caption` (a bare tag flag) renders it at the
 * smaller caption size — e.g. a footnote under a call to action.
 */
export function Muted({
  caption,
  children,
}: {
  caption?: boolean | string
  children: ReactNode
}) {
  const isCaption =
    caption !== undefined && caption !== false && caption !== 'false'
  return (
    <Text
      as="p"
      size={isCaption ? 'caption' : undefined}
      className="text-mid-grey-00"
    >
      {children}
    </Text>
  )
}
