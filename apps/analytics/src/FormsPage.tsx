import { Heading, Text } from '@govtech-bb/react'
import { useNavigate } from '@tanstack/react-router'
import { AnalyticsChrome } from './components/AnalyticsChrome'
import { FormsTable } from './components/FormsTable'
import type { FormsPayload } from './lib/report'

export default function FormsPage({ data }: { data: FormsPayload }) {
  const navigate = useNavigate()
  return (
    <>
      <AnalyticsChrome
        range={data.range}
        onRangeChange={(range) =>
          navigate({ to: '/analytics/forms', search: { range } })
        }
      />
      <div className="container py-8">
        <Heading as="h1" size="h1" className="mb-s">
          Forms
        </Heading>
        <Text as="p" size="caption" className="mb-l text-mid-grey-00">
          All published forms and their starts and completion for {data.window}.
          Select a form for its full detail.
        </Text>
        {data.configured ? (
          <FormsTable forms={data.forms} range={data.range} />
        ) : (
          <Text as="p" className="text-mid-grey-00">
            Analytics is not configured.
          </Text>
        )}
      </div>
    </>
  )
}
