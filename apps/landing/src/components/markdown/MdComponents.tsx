import {
  Heading,
  LinkButton,
  List,
  Table,
  TableCell,
  TableHeader,
  Text,
} from '@govtech-bb/react'
import type { ReactNode } from 'react'
import type { Components } from 'hast-util-to-jsx-runtime'
import { MarkdownLink } from './MarkdownLink'
import { Notice } from '../content/Notice'
import { Highlights, Highlight } from '../content/Highlights'
import { Contacts, Contact } from '../content/Contacts'
import { Muted } from '../content/Muted'

const PHONE_SLASH_RE = /^\((\d{3})\)\s*(\d{3})-(\d{4})\s*\/\s*(\d{4})$/
const PHONE_RE = /^\((\d{3})\)\s*(\d{3})-(\d{4})$/

function extractCellText(children: ReactNode): string | null {
  if (typeof children === 'string') return children
  if (
    Array.isArray(children) &&
    children.length === 1 &&
    typeof children[0] === 'string'
  ) {
    return children[0]
  }
  return null
}

export const markdownComponents: Partial<Components> = {
  h1: ({ node: _node, children, ...props }) => (
    <Heading as="h1" {...props}>
      {children}
    </Heading>
  ),
  h2: ({ node: _node, children, ...props }) => (
    <Heading as="h2" className="scroll-mt-24" {...props}>
      {children}
    </Heading>
  ),
  h3: ({ node: _node, children, ...props }) => (
    <Heading as="h3" className="scroll-mt-24" {...props}>
      {children}
    </Heading>
  ),
  h4: ({ node: _node, children, ...props }) => (
    <Heading as="h4" className="scroll-mt-24" {...props}>
      {children}
    </Heading>
  ),
  p: ({ node: _node, children, ...props }) => (
    <Text as="p" size="body" {...props}>
      {children}
    </Text>
  ),
  ul: ({ node: _node, children, ...props }) => (
    <List variant="bullet" {...props}>
      {children}
    </List>
  ),
  ol: ({ node: _node, children, ...props }) => (
    <List variant="number" {...props}>
      {children}
    </List>
  ),
  li: ({ node: _node, children, ...props }) => (
    <li className="space-y-s" {...props}>
      {children}
    </li>
  ),
  hr: ({ node: _node, ...props }) => (
    <hr className="my-8 border border-gray-100" {...props} />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre className="overflow-x-auto whitespace-pre-wrap" {...props} />
  ),
  a: ({ node: _node, href, children, ...rest }) => (
    <MarkdownLink href={href} {...rest}>
      {children}
    </MarkdownLink>
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="ml-[0.075em] border-gray-300 border-l-3 pl-4 text-gray-700"
      {...props}
    />
  ),
  // Not `scrollable`: that wraps the table in a role="region", and a markdown
  // table has no caption to name it with.
  table: ({ node: _node, ...props }) => (
    <div className="my-s overflow-x-auto">
      <Table {...props} />
    </div>
  ),
  thead: ({ node: _node, ...props }) => <thead {...props} />,
  tbody: ({ node: _node, ...props }) => <tbody {...props} />,
  tr: ({ node: _node, ...props }) => <tr {...props} />,
  th: ({ node: _node, ...props }) => (
    <TableHeader {...props} />
  ),
  td: ({ node: _node, children, ...props }) => {
    const text = extractCellText(children)

    const slashMatch = text?.match(PHONE_SLASH_RE)
    if (slashMatch) {
      const [, area, prefix, line, line2] = slashMatch
      return (
        <TableCell {...props}>
          <a
            className="text-teal-80 underline"
            href={`tel:+1${area}${prefix}${line}`}
          >
            {`(${area}) ${prefix}-${line}`}
          </a>
          {' / '}
          <a
            className="text-teal-80 underline"
            href={`tel:+1${area}${prefix}${line2}`}
          >
            {line2}
          </a>
        </TableCell>
      )
    }

    const phoneMatch = text?.match(PHONE_RE)
    if (phoneMatch) {
      const [, area, prefix, line] = phoneMatch
      return (
        <TableCell {...props}>
          <a
            className="text-teal-80 underline"
            href={`tel:+1${area}${prefix}${line}`}
          >
            {text}
          </a>
        </TableCell>
      )
    }

    return (
      <TableCell {...props}>
        {children}
      </TableCell>
    )
  },
  // Curated content palette, authored as `remark-directive` blocks
  // (`:::notice`, `::contact{…}`, …). Valid names/attributes are enforced by
  // the content lint; directive children stay markdown.
  notice: Notice,
  highlights: Highlights,
  highlight: Highlight,
  contacts: Contacts,
  contact: Contact,
  muted: Muted,
  buttons: ({ children }: { children?: ReactNode }) => (
    <div className="flex flex-col gap-s sm:flex-row">{children}</div>
  ),
  'link-button': ({ node: _node, children, ...props }) => (
    <LinkButton {...(props as { href: string; variant?: 'secondary' })}>
      {children}
    </LinkButton>
  ),
}
