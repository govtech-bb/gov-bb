import { Link } from '@govtech-bb/react'
import type { ReactNode } from 'react'
import { StartLink } from './StartLink'

/**
 * Anchor renderer for markdown. A `data-start-link` anchor becomes a form CTA
 * (see {@link StartLink}), reading the `data-form-id` baked onto the node in the
 * registry; the `#` link appended to headings stays a plain anchor; everything
 * else is a {@link Link}, marked external unless it is an in-site (`/`) or
 * in-page (`#`) target.
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
    const {
      'data-start-link': _startLink,
      'data-form-id': formId,
      ...linkRest
    } = rest
    return (
      <StartLink
        href={href}
        formId={typeof formId === 'string' ? formId : undefined}
        {...linkRest}
      >
        {children}
      </StartLink>
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
