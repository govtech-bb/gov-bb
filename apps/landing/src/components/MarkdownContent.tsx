import { Heading, Link, LinkButton, Text } from '@govtech-bb/react'
import { useLocation } from '@tanstack/react-router'
import { format } from 'date-fns'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import rehypeHideStartLinks from '../lib/rehype-hide-start-links'
import rehypeSectionise from '../lib/rehype-sectionise'
import type { Frontmatter } from '../lib/frontmatter'
import { MigrationBanner } from './MigrationBanner'
import { AVAILABLE_FORMS } from '../content/available-forms.gen'

const FORMS_BASE_URL =
  import.meta.env.VITE_FORMS_URL ?? 'https://forms.sandbox.alpha.gov.bb'

/**
 * Form ID for the currently-rendering page, read from frontmatter and
 * provided so the Markdown anchor handler can decide whether to render
 * a Start now button when it sees `<a data-start-link>`.
 */
const PageFormIdContext = createContext<string | undefined>(undefined)

type StartLinkProps = {
  formId: string
  children: ReactNode
} & Record<string, unknown>

function StartLink({ formId, children, ...rest }: StartLinkProps) {
  const { pathname } = useLocation()
  return (
    <LinkButton
      href={`${FORMS_BASE_URL}/forms/${formId}`}
      {...rest}
      data-umami-event={`${formId}-start`}
      data-umami-event-from={pathname}
    >
      {children}
    </LinkButton>
  )
}

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
        <StartLinkFromContext href={href} rest={rest}>
          {children}
        </StartLinkFromContext>
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

/**
 * Inner component for `<a data-start-link>` anchors in Markdown.
 *
 * Two routes:
 *   1. Page frontmatter has `form_id` → look it up in the build-time manifest
 *      and render `StartLink` (button → FORMS_BASE_URL/forms/{form_id}).
 *   2. No `form_id`, but the markdown supplied an `href` → render a plain
 *      `LinkButton` with that href. Lets index.md pages link to local
 *      landing routes (built-in calculators etc.) while still getting the
 *      button affordance.
 *
 * Silent miss in production when neither path resolves; warns in dev so
 * authoring typos surface during review. See docs/decisions/0005.
 */
function StartLinkFromContext({
  href,
  rest,
  children,
}: {
  href: string | undefined
  rest: Record<string, unknown>
  children: ReactNode
}) {
  const formId = useContext(PageFormIdContext)

  if (formId) {
    if (!AVAILABLE_FORMS.has(formId)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[MarkdownContent] form_id "${formId}" is not in the build-time ` +
            'manifest (see src/content/available-forms.gen.ts) — Start now ' +
            'button suppressed.',
        )
      }
      return null
    }
    return (
      <StartLink formId={formId} {...rest}>
        {children}
      </StartLink>
    )
  }

  if (href) {
    return (
      <LinkButton href={href} {...rest}>
        {children}
      </LinkButton>
    )
  }

  if (import.meta.env.DEV) {
    console.warn(
      '[MarkdownContent] <a data-start-link> rendered with neither ' +
        '`form_id` in frontmatter nor an `href` attribute — button suppressed.',
    )
  }
  return null
}

export function MarkdownBody({
  body,
  formId,
  hideStartLink = false,
}: {
  body: string
  formId?: string
  hideStartLink?: boolean
}) {
  return (
    <PageFormIdContext.Provider value={formId}>
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[
          rehypeRaw,
          [rehypeHideStartLinks, { hideStartLink }],
          rehypeSectionise,
        ]}
        remarkPlugins={[remarkGfm]}
      >
        {body}
      </ReactMarkdown>
    </PageFormIdContext.Provider>
  )
}

export type MarkdownContentProps = {
  frontmatter: Frontmatter
  body: string
  hideStartLink?: boolean
}

export function MarkdownContent({
  frontmatter,
  body,
  hideStartLink = false,
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
        <MarkdownBody
          body={body}
          formId={frontmatter.form_id}
          hideStartLink={hideStartLink}
        />
      </div>
    </div>
  )
}
