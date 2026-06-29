import type { ReactNode } from 'react'
import { Text } from '@govtech-bb/react'

/**
 * A muted (grey) paragraph — page lede, section intro, or `size="caption"` note.
 * Keep its content on one line in `.mdx`: a multi-line block would be wrapped in
 * MDX's own `<p>`, nesting it inside this one.
 */
export function Muted({
  size,
  children,
}: {
  size?: 'caption'
  children: ReactNode
}) {
  return (
    <Text as="p" size={size} className="text-mid-grey-00">
      {children}
    </Text>
  )
}
