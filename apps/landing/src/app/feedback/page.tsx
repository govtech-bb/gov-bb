import type { Metadata } from 'next'
import { Heading, Text } from '@govtech-bb/react'
import { FeedbackForm } from '@/components/FeedbackForm'

export const metadata: Metadata = {
  title: 'Help us improve alpha.gov.bb | Government of Barbados',
  description:
    'Share feedback to help us make government services clearer, simpler and faster.',
}

export default function FeedbackPage() {
  return (
    <div className="container pt-4 pb-8 lg:py-8">
      <div className="mb-6 space-y-6">
        <Heading as="h1">Help us improve alpha.gov.bb</Heading>
        <div className="space-y-3">
          <Text as="p">
            Your feedback will help us make it clearer, simpler and faster to
            find and use public services.
          </Text>
          <Text as="p">Do not include personal information.</Text>
        </div>
      </div>
      <FeedbackForm />
    </div>
  )
}
