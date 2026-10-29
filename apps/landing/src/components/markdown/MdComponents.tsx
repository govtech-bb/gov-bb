import {
  LinkButton,
  ShowHide,
  Table,
  TableCell,
  TableHeader,
} from '@govtech-bb/react'
import type { ReactNode } from 'react'
import type { Components } from 'hast-util-to-jsx-runtime'
import { MarkdownLink } from './MarkdownLink'
import { Notice } from '../content/Notice'
import { Highlights, Highlight } from '../content/Highlights'
import { Contacts, Contact } from '../content/Contacts'
import { ContactRecord } from '../content/ContactRecord'
import { Muted } from '../content/Muted'

const PHONE_SLASH_RE = /^\((\d{3})\)\s*(\d{3})-(\d{4})\s*\/\s*(\d{4})$/
const PHONE_RE = /^\((\d{3})\)\s*(\d{3})-(\d{4})$/
const STACKED_CELL =
  'max-md:block max-md:w-full max-md:before:block max-md:before:font-bold max-md:before:content-[attr(data-label)]'

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
  a: ({ node: _node, href, children, ...rest }) => (
    <MarkdownLink href={href} {...rest}>
      {children}
    </MarkdownLink>
  ),
  // Not `scrollable`: that wraps the table in a role="region", and a markdown
  // table has no caption to name it with.
  //
  // Below the tablet breakpoint each row stacks into a block: its row header
  // is the title and every other cell shows its column as a label (the
  // `data-label` tableScopes adds), because the design system's fixed, equal
  // columns break words anywhere at phone width. `display: block` drops the
  // implicit table semantics in some screen readers, so the roles are explicit.
  table: ({ node: _node, ...props }) => (
    <div className="my-s overflow-x-auto">
      <Table {...props} role="table" className="max-md:block" />
    </div>
  ),
  thead: ({ node: _node, ...props }) => (
    <thead {...props} role="rowgroup" className="max-md:sr-only" />
  ),
  tbody: ({ node: _node, ...props }) => (
    <tbody {...props} role="rowgroup" className="max-md:block" />
  ),
  tr: ({ node: _node, ...props }) => (
    <tr {...props} role="row" className="max-md:mb-s max-md:block" />
  ),
  th: ({ node: _node, ...props }) => (
    <TableHeader
      {...props}
      role={props.scope === 'row' ? 'rowheader' : 'columnheader'}
      className="max-md:block max-md:w-full"
    />
  ),
  td: ({ node: _node, children, ...rest }) => {
    const text = extractCellText(children)
    const props = { ...rest, role: 'cell', className: STACKED_CELL }

    const slashMatch = text?.match(PHONE_SLASH_RE)
    if (slashMatch) {
      const [, area, prefix, line, line2] = slashMatch
      return (
        <TableCell {...props}>
          <a
            className="whitespace-nowrap text-teal-80 underline"
            href={`tel:+1${area}${prefix}${line}`}
          >
            {`(${area}) ${prefix}-${line}`}
          </a>
          {' / '}
          <a
            className="whitespace-nowrap text-teal-80 underline"
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
            className="whitespace-nowrap text-teal-80 underline"
            href={`tel:+1${area}${prefix}${line}`}
          >
            {text}
          </a>
        </TableCell>
      )
    }

    return <TableCell {...props}>{children}</TableCell>
  },
  // Curated content palette, authored as `remark-directive` blocks
  // (`:::notice`, `::contact{…}`, …). Valid names/attributes are enforced by
  // the content lint; directive children stay markdown.
  notice: Notice,
  highlights: Highlights,
  highlight: Highlight,
  contacts: Contacts,
  contact: Contact,
  'contact-record': ContactRecord,
  muted: Muted,
  'show-hide': ({
    node: _node,
    summary,
    children,
    ...props
  }: {
    node?: unknown
    summary?: string
    children?: ReactNode
  }) => (
    <ShowHide summary={summary || 'More information'} {...props}>
      {children}
    </ShowHide>
  ),
  buttons: ({ children }: { children?: ReactNode }) => (
    <div className="flex flex-col gap-s sm:flex-row">{children}</div>
  ),
  'link-button': ({ node: _node, children, ...props }) => (
    <LinkButton {...(props as { href: string; variant?: 'secondary' })}>
      {children}
    </LinkButton>
  ),
}
