import type { MarkdownComponents } from '@govtech-bb/govbbmarkd/react'
import { MarkdownLink } from './MarkdownLink'
import { ContactRecord } from '../content/ContactRecord'
import { CollectionFact } from '../content/CollectionFact'

/** Public-site routing and form availability remain host-owned. */
export const markdownComponents: MarkdownComponents = {
  a: ({ node: _node, href, children, ...rest }) => (
    <MarkdownLink href={href} {...rest}>
      {children}
    </MarkdownLink>
  ),
  // A record's contact details (#3185), read at request time
  'contact-record': ContactRecord,
  // One value from a record, in a line of text (#3590)
  'collection-fact': CollectionFact,
}
