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
    return <a href={safeHref} {...rest} />
  }

  return (
    <Link external={isExternal} href={safeHref} {...rest}>
      {children}
    </Link>
  )
}
