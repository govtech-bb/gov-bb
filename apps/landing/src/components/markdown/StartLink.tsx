import { LinkButton } from '@govtech-bb/react'
import { useLocation } from '@tanstack/react-router'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

const FORMS_BASE_URL =
  import.meta.env.VITE_FORMS_URL ?? 'https://forms.sandbox.alpha.gov.bb'

/**
 * Form ID for the currently-rendering page, read from frontmatter and provided
 * so the Markdown anchor handler can decide whether to render a Start now
 * button when it sees `<a data-start-link>`.
 */
export const PageFormIdContext = createContext<string | undefined>(undefined)

/**
 * The set of form IDs available right now, resolved server-side from the forms
 * API and threaded down through the route loader (see `lib/available-forms.ts`).
 * The anchor handler checks a page's `form_id` against this set to decide
 * whether the Start now button renders. Empty by default so a render without a
 * provider simply suppresses buttons.
 */
export const AvailableFormsContext = createContext<ReadonlySet<string>>(new Set())

type StartLinkProps = {
  formId: string
  children: ReactNode
} & Record<string, unknown>

function StartLink({ formId, children, ...rest }: StartLinkProps) {
  const { pathname } = useLocation()
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

/**
 * Renders an `<a data-start-link>` CTA. An authored `href` wins — an entry page
 * links to its own start page, which the page's `form_id` must not override; a
 * page with only `form_id` links to the form (suppressed if it isn't live).
 * Warns in dev when neither resolves. See docs/decisions/0005.
 */
export function StartLinkFromContext({
  href,
  rest,
  children,
}: {
  href: string | undefined
  rest: Record<string, unknown>
  children: ReactNode
}) {
  const formId = useContext(PageFormIdContext)
  const availableForms = useContext(AvailableFormsContext)

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
          `[MarkdownContent] form_id "${formId}" is not in the forms API's ` +
            'available list (see lib/available-forms.ts) — Start now ' +
            'button suppressed.',
        )
      }
      return null
    }
    return (
      <StartLink formId={formId} {...rest}>
        {children}
      </StartLink>
    )
  }

  if (import.meta.env.DEV) {
    console.warn(
      '[MarkdownContent] <a data-start-link> rendered with neither ' +
        '`form_id` in frontmatter nor an `href` attribute — button suppressed.',
    )
  }
  return null
}
