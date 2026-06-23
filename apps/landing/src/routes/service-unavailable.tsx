import { createFileRoute } from '@tanstack/react-router'
import { ErrorPage } from '../components/ErrorPage'

export const Route = createFileRoute('/service-unavailable')({
  head: () => ({
    meta: [{ title: 'Service unavailable | Government of Barbados' }],
  }),
  component: ServiceUnavailable,
})

function ServiceUnavailable() {
  return (
    <ErrorPage
      title="This service is temporarily unavailable"
      intro="We're performing scheduled maintenance or experiencing unusually high traffic. This service should be back soon."
      suggestions={[
        'Try again in a few minutes',
        'Return to the homepage to access other services',
        'Contact us for urgent enquiries',
      ]}
      secondary={{ label: 'Contact us', href: '/contact' }}
      primary={{ label: 'Return to homepage', href: '/' }}
    />
  )
}
