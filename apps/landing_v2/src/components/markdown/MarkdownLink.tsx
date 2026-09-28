import { Link } from '@govtech-bb/react'
import type { ReactNode } from 'react'
import { StartLink } from './StartLink'

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
  // `tel:` hands off to the dialler rather than navigating, so it must not get
  // target="_blank" — that leaves a blank tab behind on desktop.
  const isExternal = !(
    safeHref.startsWith('/') ||
    safeHref.startsWith('#') ||
    safeHref.startsWith('tel:')
  )

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
    return <a href={safeHref} {...rest} />
  }

  return (
    <Link
      href={safeHref}
      {...(isExternal
        ? { rel: 'noopener noreferrer', target: '_blank' }
        : undefined)}
      {...rest}
    >
      {children}
    </Link>
  )
}
