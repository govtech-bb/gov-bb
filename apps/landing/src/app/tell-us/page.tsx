import type { Metadata } from 'next'
import { TallyEmbed } from '@/components/TallyEmbed'

export const metadata: Metadata = {
  title: 'Tell us what matters | Government of Barbados',
  description:
    'Help us improve government services in Barbados by sharing what matters to you.',
}

export default function TellUsPage() {
  return (
    <div className="container pt-4 pb-8 lg:py-8">
      <TallyEmbed />
    </div>
  )
}
