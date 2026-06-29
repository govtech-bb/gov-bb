import { LinkButton } from '@govtech-bb/react'
import { useLocation } from '@tanstack/react-router'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

const FORMS_BASE_URL =
  import.meta.env.VITE_FORMS_URL ?? 'https://forms.sandbox.alpha.gov.bb'

// Live form ids, resolved server-side per request (see lib/available-forms.ts).
export const AvailableFormsContext = createContext<ReadonlySet<string>>(new Set())

// The current page's form_id, supplied by the route. An MDX `<StartLink>` (unlike
// the old build-baked `<a data-start-link data-form-id>`) carries no id of its
// own, so it resolves one from here; an explicit `formId` prop still wins.
export const FormIdContext = createContext<string | undefined>(undefined)

type StartLinkProps = {
  href?: string
  formId?: string
  children: ReactNode
} & Record<string, unknown>

// An authored href wins over formId; an unavailable formId suppresses the
// button. See docs/decisions/0005.
export function StartLink({ href, formId, children, ...rest }: StartLinkProps) {
  const availableForms = useContext(AvailableFormsContext)
  const ctxFormId = useContext(FormIdContext)
  const { pathname } = useLocation()
  const resolvedFormId = formId ?? ctxFormId

  if (href) {
    return (
      <LinkButton href={href} {...rest}>
        {children}
      </LinkButton>
    )
  }

  if (resolvedFormId) {
    if (!availableForms.has(resolvedFormId)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[markdown] form_id "${resolvedFormId}" is not in the forms API's available ` +
            'list (see lib/available-forms.ts) — Start now button suppressed.',
        )
      }
      return null
    }
    return (
      <LinkButton
        href={`${FORMS_BASE_URL}/forms/${resolvedFormId}`}
        {...rest}
        data-umami-event={`${resolvedFormId}-start`}
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
