import type { MarkdownComponents } from '@govtech-bb/govbbmarkd/react'
import { MarkdownLink } from './MarkdownLink'
import { Highlights, Highlight } from '../content/Highlights'
import { Contacts, Contact } from '../content/Contacts'
import { Muted } from '../content/Muted'

/** Public-site routing, form availability and retained application HTML remain host-owned. */
export const markdownComponents: MarkdownComponents = {
  a: ({ node: _node, href, children, ...rest }) => (
    <MarkdownLink href={href} {...rest}>
      {children}
    </MarkdownLink>
  ),
  highlights: Highlights,
  highlight: Highlight,
  contacts: Contacts,
  contact: Contact,
  muted: Muted,
}
