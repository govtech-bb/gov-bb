import { Heading, Select, Text } from '@govtech-bb/react'
import { Link, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { RANGE_OPTIONS } from '../lib/umami-server'

// Standard header shared by the overview and per-form pages: title, optional
// subtitle + back-link, and the Date range selector (with an "Updating…" spinner
// while the loader re-runs). Range changes are handled by the caller so each
// page can navigate to its own route with full type safety; this component owns
// the selector UI and loading state.
export function AnalyticsHeader({
  title,
  subtitle,
  backTo,
  range,
  onRangeChange,
}: {
  title: string
  subtitle?: ReactNode
  backTo?: string
  range: string
  onRangeChange: (range: string) => void
}) {
  // True while a navigation (e.g. a range change) is running its loader.
  const isLoading = useRouterState({ select: (s) => s.isLoading })

  return (
    <header className="mb-l">
      <style>{SPIN_CSS}</style>
      {backTo ? (
        <Link to={backTo} className="text-caption text-teal-00 underline">
          ← All forms
        </Link>
      ) : null}
      <Heading as="h1" size="h1" className={backTo ? 'mt-s' : undefined}>
        {title}
      </Heading>
      {subtitle ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          {subtitle}
        </Text>
      ) : null}
      <div className="mt-s flex items-end gap-s">
        <div className="max-w-[220px] grow">
          <Select
            label="Date range"
            value={range}
            disabled={isLoading}
            onChange={(e) => onRangeChange(e.target.value)}
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {isLoading ? (
          <span
            role="status"
            className="flex items-center gap-xs pb-xs text-caption text-mid-grey-00"
          >
            <Spinner />
            Updating…
          </span>
        ) : null}
      </div>
    </header>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="uar-spin inline-block h-[14px] w-[14px] rounded-full border-2 border-grey-00 border-t-teal-00"
    />
  )
}

const SPIN_CSS = `
.uar-spin { animation: uar-spin .7s linear infinite; }
@keyframes uar-spin { to { transform: rotate(360deg); } }
`
