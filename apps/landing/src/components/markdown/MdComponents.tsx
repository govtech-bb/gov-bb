import { Heading, LinkButton, Text } from '@govtech-bb/react'
import type { ReactNode } from 'react'
import type { Components } from 'hast-util-to-jsx-runtime'
import { MarkdownLink } from './MarkdownLink'
import { Notice } from '../content/Notice'
import { Highlights, Highlight } from '../content/Highlights'
import { Contacts, Contact } from '../content/Contacts'
import { Contents } from '../content/Contents'
import { EmergencyPhones, EmergencyPhone } from '../content/EmergencyPhones'
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
    <ul className="list-disc pl-7" {...props}>
      {children}
    </ul>
  ),
  ol: ({ node: _node, children, ...props }) => (
    <ol className="list-decimal space-y-4 pl-7" {...props}>
      {children}
    </ol>
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
  table: ({ node: _node, ...props }) => (
    <div className="my-s overflow-x-auto">
      <div className="inline-block min-w-full align-middle">
        <table className="min-w-full" {...props} />
      </div>
    </div>
  ),
  thead: ({ node: _node, ...props }) => (
    <thead className="bg-blue-10" {...props} />
  ),
  tbody: ({ node: _node, ...props }) => (
    <tbody className="bg-white" {...props} />
  ),
  tr: ({ node: _node, ...props }) => <tr {...props} />,
  th: ({ node: _node, ...props }) => (
    <th
      className="w-1/2 px-xs py-s text-left align-top font-bold text-caption text-mid-grey-00"
      {...props}
    />
  ),
  td: ({ node: _node, children, ...props }) => {
    const text = extractCellText(children)

    const slashMatch = text?.match(PHONE_SLASH_RE)
    if (slashMatch) {
      const [, area, prefix, line, line2] = slashMatch
      return (
        <td
          className="w-1/2 px-xs py-s align-top text-black text-caption"
          {...props}
        >
          <a
            className="text-teal-00 underline"
            href={`tel:+1${area}${prefix}${line}`}
          >
            {`(${area}) ${prefix}-${line}`}
          </a>
          {' / '}
          <a
            className="text-teal-00 underline"
            href={`tel:+1${area}${prefix}${line2}`}
          >
            {line2}
          </a>
        </td>
      )
    }

    const phoneMatch = text?.match(PHONE_RE)
    if (phoneMatch) {
      const [, area, prefix, line] = phoneMatch
      return (
        <td
          className="w-1/2 px-xs py-s align-top text-black text-caption"
          {...props}
        >
          <a
            className="text-teal-00 underline"
            href={`tel:+1${area}${prefix}${line}`}
          >
            {text}
          </a>
        </td>
      )
    }

    return (
      <td
        className="w-1/2 px-xs py-s align-top text-black text-caption"
        {...props}
      >
        {children}
      </td>
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
  contents: Contents,
  'emergency-phones': EmergencyPhones,
  'emergency-phone': EmergencyPhone,
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
