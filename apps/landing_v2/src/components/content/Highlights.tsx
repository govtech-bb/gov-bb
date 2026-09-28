import type { ReactNode } from 'react'
import { Heading } from '@govtech-bb/react'

/** Grid of highlight cards. Part of the curated content palette. */
export function Highlights({ children }: { children: ReactNode }) {
  return (
    <ul className="grid list-none grid-cols-1 gap-s p-0 sm:grid-cols-2">
      {children}
    </ul>
  )
}

/** A single titled highlight card; body is the children. */
export function Highlight({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <li className="flex flex-col gap-xxs bg-teal-10 p-s">
      <Heading as="h4" size="h3">
        {title}
      </Heading>
      {children}
    </li>
  )
}
