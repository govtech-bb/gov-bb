import type { MarkdownComponents } from '@govtech-bb/govbbmarkd/react'
import { MarkdownLink } from './MarkdownLink'
import { ContactRecord } from '../content/ContactRecord'

/** Public-site routing and form availability remain host-owned. */
export const markdownComponents: MarkdownComponents = {
  a: ({ node: _node, href, children, ...rest }) => (
    <MarkdownLink href={href} {...rest}>
      {children}
    </MarkdownLink>
  ),
  // A record's contact details (#3185), read at request time
  'contact-record': ContactRecord,
}
