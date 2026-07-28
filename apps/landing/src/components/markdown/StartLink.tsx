import { LinkButton } from '@govtech-bb/react'
import { useLocation } from '@tanstack/react-router'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { requireEnv } from '@/config/env'

const FORMS_BASE_URL = requireEnv(
  import.meta.env.VITE_FORMS_URL,
  'VITE_FORMS_URL',
  'https://forms.sandbox.alpha.gov.bb',
)

// Live form ids, resolved server-side per request (see lib/available-forms.ts).
export const AvailableFormsContext = createContext<ReadonlySet<string>>(new Set())

type StartLinkProps = {
  href?: string
  formId?: string
  children: ReactNode
} & Record<string, unknown>

// An authored href wins over formId; an unavailable formId suppresses the
// button. See docs/decisions/0005.
export function StartLink({ href, formId, children, ...rest }: StartLinkProps) {
  const availableForms = useContext(AvailableFormsContext)
  const { pathname } = useLocation()

  if (href) {
    return (
      <LinkButton href={href} {...rest}>
        {children}
      </LinkButton>
    )
  }

  if (formId) {
    if (!availableForms.has(formId)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[markdown] form_id "${formId}" is not in the forms API's available ` +
            'list (see lib/available-forms.ts) — Start now button suppressed.',
        )
      }
      return null
    }
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
