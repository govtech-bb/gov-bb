import type { ErrorComponentProps } from '@tanstack/react-router'
import { ErrorPage } from './ErrorPage'
import { ServerErrorPage } from './ServerErrorPage'

/** Thrown when the content API is down and the URL has no cached copy. */
export const CONTENT_API_UNREACHABLE = 'content API unreachable'

// Matched on the message, not a class: the error is serialised to the client
// on SSR and a subclass would not survive hydration.
export function ContentRouteError({ error }: ErrorComponentProps) {
  if (error.message !== CONTENT_API_UNREACHABLE) return <ServerErrorPage />
  return (
    <ErrorPage
      title="This service is temporarily unavailable"
      intro="We're performing scheduled maintenance or experiencing unusually high traffic. This service should be back soon."
      suggestions={[
        'Try again in a few minutes',
        'Return to the homepage to access other services',
      ]}
      primary={{ label: 'Return to homepage', href: '/' }}
    />
  )
}
