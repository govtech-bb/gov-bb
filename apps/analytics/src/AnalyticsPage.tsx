import { Heading, Select, Text } from '@govtech-bb/react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import * as React from 'react'
import { FreshnessBanner } from './components/FreshnessBanner'
import type { OverviewPayload } from './lib/report'
import { RANGE_OPTIONS } from './lib/umami-server'

const fmtInt = (n: number) => n.toLocaleString()

const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

interface SrcPop {
  sources: { referrer: string; count: number }[]
  x: number
  y: number
}

function HowToButton({ target }: { target: string }) {
  return (
    <button
      type="button"
      popoverTarget={target}
      className="rounded-full border border-grey-00 px-s py-xs text-caption font-bold text-teal-00"
    >
      How it works
    </button>
  )
}

export default function AnalyticsPage({
  overview,
}: {
  overview: OverviewPayload
}) {
  const navigate = useNavigate()
  const [srcPop, setSrcPop] = React.useState<SrcPop | null>(null)
  // True while a navigation (e.g. a range change) is running its loader.
  const isLoading = useRouterState({ select: (s) => s.isLoading })

  if (!overview.configured) {
    return (
      <div className="container py-8">
        <Heading as="h1" size="h1">
          Umami Analytics
        </Heading>
        <Text as="p" className="mt-s text-mid-grey-00">
          Analytics is not configured. Set <code>UMAMI_API_KEY</code>,{' '}
          <code>UMAMI_LANDING_WEBSITE_ID</code> and{' '}
          <code>UMAMI_FORMS_WEBSITE_ID</code> on the deployment.
        </Text>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <style>{POPOVER_CSS}</style>

      <header className="mb-l">
        <Heading as="h1" size="h1">
          Umami Analytics
        </Heading>
        <Text as="p" size="caption" className="text-mid-grey-00">
          {fmtInt(overview.stats.visitors)} visitors ·{' '}
          {fmtInt(overview.stats.pageviews)} pageviews
        </Text>
        <div className="mt-s flex items-end gap-s">
          <div className="max-w-[220px] grow">
            <Select
              label="Date range"
              value={overview.range}
              disabled={isLoading}
              onChange={(e) =>
                navigate({ to: '/', search: { range: e.target.value } })
              }
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
        <FreshnessBanner
          window={overview.window}
          generatedAt={overview.generatedAt}
        />
      </header>

      <div
        aria-busy={isLoading}
        className={`transition-opacity ${isLoading ? 'pointer-events-none opacity-50' : ''}`}
      >
        {/* Top pages */}
        <section className="mb-l">
        <div className="mb-s flex items-center justify-between gap-s">
          <Heading as="h2" size="h3">
            Top pages
          </Heading>
          <HowToButton target="uar-howto-pages" />
        </div>
        <div className={CARD}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={TH}>Path</th>
                <th className={`${TH} ${NUM}`}>Pageviews</th>
                <th className={`${TH} ${NUM}`}>Visitors</th>
                <th className={TH}>Top source</th>
              </tr>
            </thead>
            <tbody>
              {overview.pages.length === 0 ? (
                <tr>
                  <td className={`${TD} text-mid-grey-00`} colSpan={4}>
                    No page data.
                  </td>
                </tr>
              ) : (
                overview.pages.map((p) => (
                  <tr key={p.path}>
                    <td className={TD}>{p.path}</td>
                    <td className={`${TD} ${NUM}`}>{fmtInt(p.pageviews)}</td>
                    <td className={`${TD} ${NUM}`}>{fmtInt(p.visitors)}</td>
                    <SourceCell sources={p.topSources} onShow={setSrcPop} />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Forms */}
      <section className="mb-l">
        <div className="mb-s flex items-center justify-between gap-s">
          <Heading as="h2" size="h3">
            Forms
          </Heading>
          <HowToButton target="uar-howto-forms" />
        </div>
        <Text as="p" size="caption" className="mb-s text-mid-grey-00">
          Select a form for its funnel, per-step drop-off, submit reliability and
          journeys.
        </Text>
        <div className={CARD}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={TH}>Form</th>
                <th className={`${TH} ${NUM}`}></th>
              </tr>
            </thead>
            <tbody>
              {overview.forms.length === 0 ? (
                <tr>
                  <td className={`${TD} text-mid-grey-00`} colSpan={2}>
                    No forms found.
                  </td>
                </tr>
              ) : (
                overview.forms.map((f) => (
                  <tr key={f.formId} className="hover:bg-teal-10">
                    <td className={TD}>
                      <Link
                        to="/analytics/forms/$formId"
                        params={{ formId: f.formId }}
                        search={{ range: overview.range }}
                        className="font-bold text-teal-00 underline"
                      >
                        {f.title}
                      </Link>
                    </td>
                    <td className={`${TD} ${NUM} text-mid-grey-00`}>View →</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </section>
      </div>

      {srcPop ? (
        <div
          className="fixed z-[60] min-w-[210px] rounded-lg border border-grey-00 bg-white-00 p-s shadow-xl"
          style={{ left: srcPop.x, top: srcPop.y }}
        >
          <Text
            as="span"
            size="small-caption"
            className="mb-xs block uppercase text-mid-grey-00"
          >
            All sources
          </Text>
          {srcPop.sources.map((s) => (
            <div
              key={s.referrer}
              className="flex justify-between gap-m py-xs text-caption"
            >
              <span>{s.referrer}</span>
              <span className="text-mid-grey-00">{fmtInt(s.count)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <HowToPopovers />
    </div>
  )
}

function SourceCell({
  sources,
  onShow,
}: {
  sources: { referrer: string; count: number }[]
  onShow: (p: SrcPop | null) => void
}) {
  if (!sources.length) return <td className={`${TD} text-mid-grey-00`}>—</td>
  const top = sources[0]
  const hasMore = sources.length > 1
  return (
    <td
      className={`${TD} ${hasMore ? 'cursor-help' : ''}`}
      onMouseEnter={
        hasMore
          ? (e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              onShow({ sources, x: Math.max(8, r.left), y: r.bottom + 4 })
            }
          : undefined
      }
      onMouseLeave={hasMore ? () => onShow(null) : undefined}
    >
      {top.referrer}{' '}
      <span className="text-mid-grey-00">({fmtInt(top.count)})</span>
      {hasMore ? (
        <span className="text-mid-grey-00"> +{sources.length - 1}</span>
      ) : null}
    </td>
  )
}

function HowToPopovers() {
  return (
    <>
      <div id="uar-howto-pages" popover="auto" className="uar-pop">
        <Heading as="h3" size="h5">
          Top pages — how it works
        </Heading>
        <Text as="p" size="caption" className="mt-xs">
          Most-visited landing pages over the selected range (Umami pageviews),
          top 10. <b>Top source</b> lists the leading referrers to each page —
          hover to see all; <code>(direct)</code> = no referrer.
        </Text>
      </div>
      <div id="uar-howto-forms" popover="auto" className="uar-pop">
        <Heading as="h3" size="h5">
          Forms — how it works
        </Heading>
        <Text as="p" size="caption" className="mt-xs">
          Every published form. Open one for its distinct-visitor funnel
          (start → review → submit), per-step reached-vs-completed drop-off,
          submit-error rate broken down by reason, and top journeys — all queried
          live for the selected range.
        </Text>
      </div>
    </>
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

// Only the native popover needs raw CSS (it's a top-layer element with a
// backdrop); the rest of the page is design-system components + Tailwind tokens.
const POPOVER_CSS = `
.uar-pop { position: fixed; inset: 0; margin: auto; height: fit-content; max-width: min(460px, 92vw); border: 1px solid var(--color-grey-00); border-radius: 12px; padding: 18px 20px; box-shadow: 0 16px 48px rgba(0,0,0,.22); background: #fff; }
.uar-pop::backdrop { background: rgba(0,0,0,.3); }
.uar-pop code { background: var(--color-teal-10); padding: 1px 5px; border-radius: 4px; }
.uar-spin { animation: uar-spin .7s linear infinite; }
@keyframes uar-spin { to { transform: rotate(360deg); } }
`
