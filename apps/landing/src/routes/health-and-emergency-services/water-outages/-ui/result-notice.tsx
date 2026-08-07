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
    <div className="space-y-4">
      <div
        className={`rounded-md border-2 p-6 ${
          tone === 'success'
            ? 'border-green-40 bg-green-10'
            : 'border-red-40 bg-red-10'
        }`}
      >
        <Heading as="h1">{title}</Heading>
        <Text as="p" className="mt-2">
          {body}
        </Text>
      </div>
      <Link href="/health-and-emergency-services/water-outages">
        Back to water outages
      </Link>
    </div>
  )
}
