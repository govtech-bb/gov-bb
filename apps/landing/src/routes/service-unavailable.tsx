import { useEffect, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ErrorPage } from '../components/ErrorPage'
import { trackEvent } from '../lib/analytics'

export const Route = createFileRoute('/service-unavailable')({
  head: () => ({
    meta: [{ title: 'Service unavailable | Government of Barbados' }],
  }),
  component: ServiceUnavailable,
})

function ServiceUnavailable() {
  // Once per view: the ref survives StrictMode's second effect run. No link
  // here carries a form id yet, so the form is never known (#3513).
  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    trackEvent('service-unavailable-view', {})
  }, [])

  return (
    <ErrorPage
      title="This service is temporarily unavailable"
      intro="We're performing scheduled maintenance or experiencing unusually high traffic. This service should be back soon."
      suggestions={[
        'Try again in a few minutes',
        'Return to the homepage to access other services',
        'Contact us for urgent enquiries',
      ]}
      secondary={{ label: 'Contact us', href: '/feedback' }}
      primary={{ label: 'Return to homepage', href: '/' }}
    />
  )
}
