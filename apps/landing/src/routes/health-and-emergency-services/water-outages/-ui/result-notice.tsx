import { Heading, Link, Text } from '@govtech-bb/react'

/** Outcome card for the confirm / unsubscribe pages. */
export function ResultNotice({
  tone,
  title,
  body,
}: {
  tone: 'success' | 'error'
  title: string
  body: string
}) {
  return (
    <div className="water-outages-page">
      <div
        className="govbb-status-banner govbb-status-banner--rounded water-outages-result"
        data-tone={tone}
      >
        <Heading as="h1">{title}</Heading>
        <Text as="p">{body}</Text>
      </div>
      <Link href="/health-and-emergency-services/water-outages">
        Back to water outages
      </Link>
    </div>
  )
}
