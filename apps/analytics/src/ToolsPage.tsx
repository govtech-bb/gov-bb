import { Heading, Text } from '@govtech-bb/react'
import { useNavigate } from '@tanstack/react-router'
import { AnalyticsChrome } from './components/AnalyticsChrome'
import { StatCards } from './components/StatCards'
import { ToolsTable } from './components/ToolsTable'
import type { ToolsPayload } from './lib/report'
import type { WaterAlertFunnel } from './lib/umami-server'

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
          <>
            <ToolsTable tools={data.tools} />
            <WaterAlerts funnel={data.waterAlerts} />
          </>
        ) : (
          <Text as="p" className="text-mid-grey-00">
            Analytics is not configured.
          </Text>
        )}
      </div>
    </>
  )
}

// The water outage alert sign-up funnel: submitted → confirmation email sent →
// confirmed, and unsubscribed. Event counts, not distinct visitors.
function WaterAlerts({ funnel }: { funnel: WaterAlertFunnel }) {
  const { submitted, sent, confirmed, unsubscribed } = funnel
  return (
    <section className="mt-l">
      <Heading as="h2" size="h3" className="mb-s">
        Water outage alert sign-ups
      </Heading>
      {submitted + sent + confirmed + unsubscribed === 0 ? (
        <Text as="p" className="text-mid-grey-00">
          No alert sign-up events in this period.
        </Text>
      ) : (
        <StatCards
          cards={[
            { label: 'Submitted', value: submitted.toLocaleString() },
            { label: 'Confirmation email sent', value: sent.toLocaleString() },
            { label: 'Confirmed', value: confirmed.toLocaleString() },
            { label: 'Unsubscribed', value: unsubscribed.toLocaleString() },
          ]}
        />
      )}
    </section>
  )
}
