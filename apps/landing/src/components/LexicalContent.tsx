import { Heading, Link, LinkButton, ShowHide, Text } from '@govtech-bb/react'
import { useLocation } from '@tanstack/react-router'
import { format } from 'date-fns'
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type {
  JSXConverters,
  JSXConvertersFunction,
} from '@payloadcms/richtext-lexical/react'
import type { Frontmatter } from '../lib/frontmatter'
import { resolveServiceHref } from '../content/registry'
import { AVAILABLE_FORMS } from '../content/available-forms.gen'
import { MigrationBanner } from './MigrationBanner'
import { Callout } from './Callout'

const FORMS_BASE_URL =
  import.meta.env.VITE_FORMS_URL ?? 'https://forms.sandbox.alpha.gov.bb'

const PHONE_SLASH_RE = /^\((\d{3})\)\s*(\d{3})-(\d{4})\s*\/\s*(\d{4})$/
const PHONE_RE = /^\((\d{3})\)\s*(\d{3})-(\d{4})$/

/** Flatten a Lexical node subtree to its plain text (for table phone matching). */
function nodeText(node: SerializedLexicalNode): string {
  const n = node as { text?: string; children?: SerializedLexicalNode[] }
  if (typeof n.text === 'string') return n.text
  return (n.children ?? []).map(nodeText).join('')
}

function PhoneCellContent({ text }: { text: string }) {
  const slash = text.match(PHONE_SLASH_RE)
  if (slash) {
    const [, area, prefix, line, line2] = slash
    return (
      <>
        <a className="text-teal-00 underline" href={`tel:+1${area}${prefix}${line}`}>
          {`(${area}) ${prefix}-${line}`}
        </a>
        {' / '}
        <a className="text-teal-00 underline" href={`tel:+1${area}${prefix}${line2}`}>
          {line2}
        </a>
      </>
    )
  }
  const single = text.match(PHONE_RE)
  if (single) {
    const [, area, prefix, line] = single
    return (
      <a className="text-teal-00 underline" href={`tel:+1${area}${prefix}${line}`}>
        {text}
      </a>
    )
  }
  return <>{text}</>
}

type StartButtonFields = {
  type?: 'form' | 'page' | 'url'
  formId?: string
  url?: string
  label?: string
}

function StartButtonBlock({ type, formId, url, label }: StartButtonFields) {
  const { pathname } = useLocation()
  const text = label?.trim() || 'Start now'

  if (type === 'form') {
    if (!formId || !AVAILABLE_FORMS.has(formId)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[LexicalContent] Start button form_id "${formId}" missing or not in the build-time manifest — button suppressed.`,
        )
      }
      return null
    }
    return (
      <LinkButton
        href={`${FORMS_BASE_URL}/forms/${formId}`}
        data-umami-event={`${formId}-start`}
        data-umami-event-from={pathname}
      >
        {text}
      </LinkButton>
    )
  }

  if (!url) return null
  return <LinkButton href={resolveServiceHref(url)}>{text}</LinkButton>
}

const converters: JSXConvertersFunction = ({ defaultConverters }) => {
  const overrides: JSXConverters = {
    heading: ({ node, nodesToJSX }) => (
      <Heading as={node.tag}>{nodesToJSX({ nodes: node.children })}</Heading>
    ),
    paragraph: ({ node, nodesToJSX }) => {
      const children = nodesToJSX({ nodes: node.children })
      if (!children?.length) return null
      return (
        <Text as="p" size="body">
          {children}
        </Text>
      )
    },
    list: ({ node, nodesToJSX }) => {
      const children = nodesToJSX({ nodes: node.children })
      return node.tag === 'ol' ? (
        <ol className="list-decimal space-y-4 pl-7">{children}</ol>
      ) : (
        <ul className="list-disc pl-7">{children}</ul>
      )
    },
    listitem: ({ node, nodesToJSX }) => (
      <li className="space-y-s">{nodesToJSX({ nodes: node.children })}</li>
    ),
    quote: ({ node, nodesToJSX }) => (
      <blockquote className="ml-[0.075em] border-gray-300 border-l-4 pl-4 text-gray-700">
        {nodesToJSX({ nodes: node.children })}
      </blockquote>
    ),
    horizontalrule: () => <hr className="my-8 border border-gray-100" />,
    link: ({ node, nodesToJSX }) => {
      const url = (node.fields?.url as string | undefined) ?? '#'
      const href = resolveServiceHref(url)
      const isExternal = !(href.startsWith('/') || href.startsWith('#'))
      return (
        <Link external={isExternal} href={href}>
          {nodesToJSX({ nodes: node.children })}
        </Link>
      )
    },
    table: ({ node, nodesToJSX }) => (
      <div className="my-s overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <table className="min-w-full">
            <tbody className="bg-white">{nodesToJSX({ nodes: node.children })}</tbody>
          </table>
        </div>
      </div>
    ),
    tablerow: ({ node, nodesToJSX }) => <tr>{nodesToJSX({ nodes: node.children })}</tr>,
    tablecell: ({ node, nodesToJSX }) => {
      const isHeader = (node.headerState as number) > 0
      if (isHeader) {
        return (
          <th className="w-1/2 px-xs py-s text-left align-top font-bold text-caption text-mid-grey-00">
            {nodesToJSX({ nodes: node.children })}
          </th>
        )
      }
      const text = (node.children as SerializedLexicalNode[]).map(nodeText).join('').trim()
      const isPhone = PHONE_SLASH_RE.test(text) || PHONE_RE.test(text)
      return (
        <td className="w-1/2 px-xs py-s align-top text-black text-caption">
          {isPhone ? <PhoneCellContent text={text} /> : nodesToJSX({ nodes: node.children })}
        </td>
      )
    },
    blocks: {
      callout: ({ node }) => {
        const f = node.fields as unknown as { variant?: string; content: SerializedEditorState }
        return (
          <Callout variant={f.variant}>
            <RichText data={f.content} converters={converters} disableContainer />
          </Callout>
        )
      },
      showHide: ({ node }) => {
        const f = node.fields as unknown as { summary?: string; content: SerializedEditorState }
        return (
          <ShowHide summary={f.summary ?? ''}>
            <RichText data={f.content} converters={converters} disableContainer />
          </ShowHide>
        )
      },
      startButton: ({ node }) => (
        <StartButtonBlock {...(node.fields as unknown as StartButtonFields)} />
      ),
      cta: ({ node }) => {
        const f = node.fields as { href?: string; label?: string }
        return (
          <LinkButton href={resolveServiceHref(f.href ?? '#')}>{f.label ?? ''}</LinkButton>
        )
      },
    },
  }
  return { ...defaultConverters, ...overrides }
}

export function LexicalBody({ body }: { body: SerializedEditorState }) {
  return <RichText data={body} converters={converters} disableContainer />
}

export type LexicalContentProps = {
  frontmatter: Frontmatter
  body: SerializedEditorState
}

export function LexicalContent({ frontmatter, body }: LexicalContentProps) {
  return (
    <div className="mb-xm lg:grid lg:grid-cols-3 lg:gap-16">
      <div className="space-y-6 lg:col-span-2 lg:space-y-8">
        <div className="space-y-4 lg:space-y-6">
          <Heading as="h1" className="break-anywhere">
            {frontmatter.title}
          </Heading>

          {frontmatter.source_url ? <MigrationBanner pageURL={frontmatter.source_url} /> : null}

          {frontmatter.updated_at ? (
            <div className="border-blue-10 border-b-4 pb-4 text-mid-grey-00">
              <Text as="p" size="caption">
                Last updated on {format(new Date(frontmatter.updated_at), 'PPP')}
              </Text>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <LexicalBody body={body} />
        </div>
      </div>
    </div>
  )
}
