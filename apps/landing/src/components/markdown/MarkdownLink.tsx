import { Link } from '@govtech-bb/react'
import type { ReactNode } from 'react'
import { StartLinkFromContext } from './StartLink'

/**
 * Anchor renderer for markdown. A `data-start-link` anchor becomes a form CTA
 * (see {@link StartLinkFromContext}); the `#` link appended to headings by
 * rehype-autolink-headings stays a plain anchor; everything else is a
 * {@link Link}, marked external unless it is an in-site (`/`) or in-page (`#`)
 * target.
 */
export function MarkdownLink({
  href,
  children,
  ...rest
}: {
  href?: string
  children?: ReactNode
} & Record<string, unknown>) {
  const safeHref = href ?? '#'
  const isStartLink = 'data-start-link' in rest
  const isAnchorHeading =
    typeof rest.className === 'string' &&
    rest.className.includes('anchor-heading')
  const isExternal = !(safeHref.startsWith('/') || safeHref.startsWith('#'))

  if (isStartLink) {
    return (
      <StartLinkFromContext href={href} rest={rest}>
        {children}
      </StartLinkFromContext>
    )
  }

  if (isAnchorHeading) {
    // eslint-disable-next-line jsx-a11y/anchor-has-content
    return <a href={safeHref} {...rest} />
  }

  return (
    <Link external={isExternal} href={safeHref} {...rest}>
      {children}
    </Link>
  )
}
