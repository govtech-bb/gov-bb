import type { MarkdownComponents } from '@govtech-bb/govbbmarkd/react'
import { MarkdownLink } from './MarkdownLink'

/** Public-site routing and form availability remain host-owned. */
export const markdownComponents: MarkdownComponents = {
  a: ({ node: _node, href, children, ...rest }) => (
    <MarkdownLink href={href} {...rest}>
      {children}
    </MarkdownLink>
  ),
}
