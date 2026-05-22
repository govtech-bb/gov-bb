import type { Metadata } from 'next'
import { ErrorPage } from '@/components/ErrorPage'

export const metadata: Metadata = {
  title: 'JavaScript required | Government of Barbados',
}

export default function JavaScriptRequired() {
  return (
    <ErrorPage
      title="This form needs JavaScript to work properly"
      intro="JavaScript is currently turned off in your browser, or your browser doesn't support it."
      suggestions={[
        "Turn on JavaScript in your browser settings. The steps differ by browser, but you'll usually find the option under Settings → Privacy and Security, or Site Settings. Once it's on, refresh this page.",
        'Try a different browser. Most up-to-date browsers (Chrome, Safari, Firefox, Edge) support JavaScript by default.',
        "Update your browser. If you're using an older version, updating may resolve the issue.",
      ]}
      secondary={{ label: 'Contact us', href: '/contact' }}
      primary={{ label: 'Return to homepage', href: '/' }}
    />
  )
}
