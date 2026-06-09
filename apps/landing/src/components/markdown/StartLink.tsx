import { LinkButton } from '@govtech-bb/react'
import { useLocation } from '@tanstack/react-router'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

const FORMS_BASE_URL =
  import.meta.env.VITE_FORMS_URL ?? 'https://forms.sandbox.alpha.gov.bb'

/**
 * The set of form IDs available right now, resolved server-side from the forms
 * API and threaded down through the route loader (see `lib/available-forms.ts`).
 * Checked against a start-link's form id to decide whether the button renders.
 * Empty by default so a render without a provider simply suppresses buttons.
 */
export const AvailableFormsContext = createContext<ReadonlySet<string>>(new Set())

type StartLinkProps = {
  /** Authored href — an entry page linking to its own start page. Wins over `formId`. */
  href?: string
  /** Page form id, baked onto the node in the registry (see `bakeStartLinkFormId`). */
  formId?: string
  children: ReactNode
} & Record<string, unknown>

/**
 * Renders an `<a data-start-link>` CTA. An authored `href` wins; otherwise the
 * `formId` baked onto the node links to the form (suppressed if it isn't live).
 * Warns in dev when neither resolves. See docs/decisions/0005.
 */
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
