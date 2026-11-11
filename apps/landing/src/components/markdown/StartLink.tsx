import { LinkButton } from '@govtech-bb/react'
import { useLocation } from '@tanstack/react-router'
import { createContext, useContext } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { requireEnv } from '@/config/env'
import { withJourneyId } from '@/lib/analytics'

const FORMS_BASE_URL = requireEnv(
  import.meta.env.VITE_FORMS_URL,
  'VITE_FORMS_URL',
  'https://forms.sandbox.alpha.gov.bb',
)

// Live form ids, resolved server-side per request (see lib/available-forms.ts).
export const AvailableFormsContext = createContext<ReadonlySet<string>>(new Set())

// Hand this tab's journey ID to the forms app, which is on another origin and
// can't read landing's sessionStorage. Added when the link is clicked (auxclick
// covers a middle-click into a new tab): the page is server-rendered, and the
// ID only exists in the browser. The plain href is put back once the browser
// has taken the URL, so a later "Copy link" never shares this tab's ID.
function addJourneyId(event: MouseEvent<HTMLAnchorElement>) {
  if (event.type === 'auxclick' && event.button !== 1) return
  const link = event.currentTarget
  const href = link.href
  link.href = withJourneyId(href)
  setTimeout(() => {
    link.href = href
  })
}

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
        data-umami-event="start-click"
        data-umami-event-form-id={formId}
        data-umami-event-from={pathname}
        onClick={addJourneyId}
        onAuxClick={addJourneyId}
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
