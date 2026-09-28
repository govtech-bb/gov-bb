import { LinkButton } from '@govtech-bb/react'
import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const FORMS_BASE_URL =
  import.meta.env.VITE_FORMS_URL ?? 'https://forms.sandbox.alpha.gov.bb'

type StartLinkProps = {
  href?: string
  formId?: string
  children: ReactNode
} & Record<string, unknown>

// An authored href wins over formId; with neither (a missing formId and no
// href) there is no button. See docs/decisions/0005.
export function StartLink({ href, formId, children, ...rest }: StartLinkProps) {
  const { pathname } = useLocation()

  if (href) {
    return (
      <LinkButton href={href} {...rest}>
        {children}
      </LinkButton>
    )
  }

  if (formId) {
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

  if (import.meta.env.DEV) {
    console.warn(
      '[markdown] <a data-start-link> rendered with neither a baked form_id ' +
        'nor an `href` attribute — button suppressed.',
    )
  }
  return null
}
