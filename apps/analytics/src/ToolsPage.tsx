import { Heading, Text } from '@govtech-bb/react'
import { useNavigate } from '@tanstack/react-router'
import { AnalyticsChrome } from './components/AnalyticsChrome'
import { ToolsTable } from './components/ToolsTable'
import type { ToolsPayload } from './lib/report'

export default function ToolsPage({ data }: { data: ToolsPayload }) {
  const navigate = useNavigate()
  return (
    <>
      <AnalyticsChrome
        range={data.range}
        onRangeChange={(range) =>
          navigate({ to: '/analytics/tools', search: { range } })
        }
      />
      <div className="container py-8">
        <Heading as="h1" size="h1" className="mb-s">
          Tools
        </Heading>
        <Text as="p" size="caption" className="mb-l text-mid-grey-00">
          Interactive tools (calculators and finders) and their usage for{' '}
          {data.window}.
        </Text>
        {data.configured ? (
          <ToolsTable tools={data.tools} />
        ) : (
          <Text as="p" className="text-mid-grey-00">
            Analytics is not configured.
          </Text>
        )}
      </div>
    </>
  )
}
