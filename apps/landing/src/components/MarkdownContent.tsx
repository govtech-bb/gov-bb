import { Heading, Link, LinkButton, Text } from '@govtech-bb/react'
import { format } from 'date-fns'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type {Components} from 'react-markdown';
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import rehypeHideStartLinks from '../lib/rehype-hide-start-links'
import rehypeSectionise from '../lib/rehype-sectionise'
import type { Frontmatter } from '../lib/frontmatter'
import { MigrationBanner } from './MigrationBanner'

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

export const markdownComponents: Components = {
  h1: ({ node: _node, children, ...props }) => (
    <Heading as="h1" {...props}>
      {children}
    </Heading>
  ),
  h2: ({ node: _node, children, ...props }) => (
    <Heading as="h2" {...props}>
      {children}
    </Heading>
  ),
  h3: ({ node: _node, children, ...props }) => (
    <Heading as="h3" {...props}>
      {children}
    </Heading>
  ),
  h4: ({ node: _node, children, ...props }) => (
    <Heading as="h4" {...props}>
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
  a: ({ node: _node, href, children, ...rest }) => {
    const safeHref = href ?? '#'
    const isStartLink = 'data-start-link' in rest
    const isExternal = !(safeHref.startsWith('/') || safeHref.startsWith('#'))

    if (isStartLink) {
      return (
        <LinkButton href={safeHref} {...rest}>
          {children}
        </LinkButton>
      )
    }

    return (
      <Link external={isExternal} href={safeHref} {...rest}>
        {children}
      </Link>
    )
  },
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
}

export function MarkdownBody({
  body,
  hasResearchAccess = false,
}: {
  body: string
  hasResearchAccess?: boolean
}) {
  return (
    <ReactMarkdown
      components={markdownComponents}
      rehypePlugins={[
        rehypeRaw,
        [rehypeHideStartLinks, { hasResearchAccess }],
        rehypeSectionise,
      ]}
      remarkPlugins={[remarkGfm]}
    >
      {body}
    </ReactMarkdown>
  )
}

export type MarkdownContentProps = {
  frontmatter: Frontmatter
  body: string
  hasResearchAccess?: boolean
}

export function MarkdownContent({
  frontmatter,
  body,
  hasResearchAccess = false,
}: MarkdownContentProps) {
  return (
    <div className="mb-xm lg:grid lg:grid-cols-3 lg:gap-16">
      <div className="space-y-6 lg:col-span-2 lg:space-y-8">
        <div className="space-y-4 lg:space-y-6">
          <Heading as="h1" className="break-anywhere">
            {frontmatter.title}
          </Heading>

          {frontmatter.source_url ? (
            <MigrationBanner pageURL={frontmatter.source_url} />
          ) : null}

          {frontmatter.publish_date ? (
            <div className="border-blue-10 border-b-4 pb-4 text-mid-grey-00">
              <Text as="p" size="caption">
                Last updated on {format(frontmatter.publish_date, 'PPP')}
              </Text>
            </div>
          ) : null}
        </div>
        <MarkdownBody body={body} hasResearchAccess={hasResearchAccess} />
      </div>
    </div>
  )
}
