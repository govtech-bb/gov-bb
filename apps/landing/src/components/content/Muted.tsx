import type { ReactNode } from 'react'
import { Text } from '@govtech-bb/react'

/**
 * A muted (grey) paragraph. `caption` (a bare tag flag) renders it at the
 * smaller body-sm size — e.g. a footnote under a call to action.
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
      size={isCaption ? 'body-sm' : undefined}
      className="text-grey-70"
    >
      {children}
    </Text>
  )
}
