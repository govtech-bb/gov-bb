import { Link, useRouterState } from '@tanstack/react-router'
import { RANGE_OPTIONS } from '../lib/umami-server'
import { GovbbLogo } from './GovbbLogo'

// Full-width blue site bar shared by the overview and per-form pages: the
// Government of Barbados wordmark + "Alpha.gov.bb analytics" on the left, and
// the date-range filter on the right (with an "Updating…" spinner while the
// loader re-runs). Range changes are handled by the caller so each page
// navigates to its own route with full type safety.
export function AnalyticsHeader({
  range,
  onRangeChange,
}: {
  range: string
  onRangeChange: (range: string) => void
}) {
  const isLoading = useRouterState({ select: (s) => s.isLoading })
  return (
    <div className="bg-blue-00 text-white-00">
      <style>{SPIN_CSS}</style>
      <div className="container flex h-16 items-center gap-m">
        <Link
          to="/"
          aria-label="Alpha.gov.bb analytics — home"
          className="flex items-center gap-s focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-100"
        >
          <GovbbLogo className="h-7 w-auto text-white-00" />
          <span aria-hidden="true" className="h-4 w-px bg-blue-40/60" />
          <span className="font-normal text-blue-40 text-caption">
            Alpha.gov.bb analytics
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-s text-caption">
          {isLoading ? (
            <span role="status" className="flex items-center gap-xs text-blue-40">
              <Spinner />
              Updating…
            </span>
          ) : null}
          <label className="flex items-center gap-xs">
            <span className="sr-only">Date range</span>
            <select
              aria-label="Date range"
              value={range}
              disabled={isLoading}
              onChange={(e) => onRangeChange(e.target.value)}
              className="rounded-sm border border-blue-40/40 bg-blue-100 px-s py-xs font-bold text-white-00 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100 disabled:opacity-60"
            >
              {RANGE_OPTIONS.map((o) => (
                <option
                  key={o.key}
                  value={o.key}
                  style={{ color: '#0b0c0c', backgroundColor: '#fff' }}
                >
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="uar-spin inline-block h-[14px] w-[14px] rounded-full border-2 border-blue-40 border-t-white-00"
    />
  )
}

const SPIN_CSS = `
.uar-spin { animation: uar-spin .7s linear infinite; }
@keyframes uar-spin { to { transform: rotate(360deg); } }
`
