import { AnalyticsHeader } from './AnalyticsHeader'
import { AnalyticsTabs } from './AnalyticsTabs'
import { LoadingOverlay } from './LoadingOverlay'

// The sticky top chrome shared by every analytics page: the blue site header
// (with the optional date-range filter) and the primary navigation tabs.
export function AnalyticsChrome({
  range,
  onRangeChange,
}: {
  range?: string
  onRangeChange?: (range: string) => void
}) {
  return (
    <>
      <div className="sticky top-0 z-40">
        <AnalyticsHeader range={range} onRangeChange={onRangeChange} />
        <AnalyticsTabs />
      </div>
      <LoadingOverlay />
    </>
  )
}
