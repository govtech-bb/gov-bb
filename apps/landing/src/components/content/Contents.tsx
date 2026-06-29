import type { ReactNode } from 'react'
import { Heading } from '@govtech-bb/react'

/** Teal "Contents" jump-link box for long guidance pages. */
export function Contents({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-labelledby="contents-heading"
      className="flex flex-col gap-s border-teal-00 border-l-4 bg-teal-10 p-s"
    >
      <Heading as="h2" id="contents-heading" size="h3">
        Contents
      </Heading>
      {children}
    </nav>
  )
}
