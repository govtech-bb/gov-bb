import type { ReactNode } from 'react'
import { Heading } from '@govtech-bb/react'

/**
 * A titled content section that exposes an `aria-labelledby` landmark. `divider`
 * adds the top rule used between sibling sections (e.g. contacts under the
 * checklist).
 */
export function Section({
  heading,
  id,
  divider,
  children,
}: {
  heading: string
  id: string
  divider?: boolean
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className={
        divider
          ? 'flex flex-col gap-s border-grey-00 border-t pt-m'
          : 'flex flex-col gap-s'
      }
    >
      <Heading as="h2" id={id}>
        {heading}
      </Heading>
      {children}
    </section>
  )
}
