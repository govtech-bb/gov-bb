import { Heading, Text } from '@govtech-bb/react'
import { AnalyticsChrome } from './AnalyticsChrome'

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <AnalyticsChrome />
      <div className="container py-8">
        <Heading as="h1" size="h1">
          {title}
        </Heading>
        <Text as="p" className="mt-s text-mid-grey-00">
          Coming soon.
        </Text>
      </div>
    </>
  )
}
