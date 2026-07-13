import { Heading, Text } from '@govtech-bb/react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import * as React from 'react'
import { FlowDiagram } from './FlowDiagram'
import { AnalyticsHeader } from './components/AnalyticsHeader'
import { SortHeader, useTableSort } from './components/SortableTable'
import type { OverviewPayload } from './lib/report'

const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}%`

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

  const pageSort = useTableSort(
    overview.pages,
    {
      path: (p) => p.path,
      pageviews: (p) => p.pageviews,
      visitors: (p) => p.visitors,
      source: (p) => p.topSources[0]?.count ?? 0,
    },
    'pageviews',
    'desc',
  )
  const formSort = useTableSort(
    overview.forms,
    {
      title: (f) => f.title,
      starts: (f) => f.starts,
      completion: (f) => f.completionPct,
    },
    'starts',
    'desc',
  )

  if (!overview.configured) {
    return (
      <div className="container py-8">
        <Heading as="h1" size="h1">
          Alpha.gov.bb analytics
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

      <AnalyticsHeader
        title="Alpha.gov.bb analytics"
        subtitle={
          <>
            {fmtInt(overview.stats.visitors)} visitors ·{' '}
            {fmtInt(overview.stats.pageviews)} pageviews
          </>
        }
        range={overview.range}
        onRangeChange={(range) => navigate({ to: '/', search: { range } })}
      />

      <div
        aria-busy={isLoading}
        className={`transition-opacity ${isLoading ? 'pointer-events-none opacity-50' : ''}`}
      >
        {/* Most visited pages */}
        <section className="mb-l">
          <div className="mb-s flex items-center justify-between gap-s">
            <Heading as="h2" size="h3">
              Most visited pages
            </Heading>
            <HowToButton target="uar-howto-pages" />
          </div>
          <div className={CARD}>
            <table className="min-w-full">
              <thead>
                <tr>
                  <SortHeader label="Path" colKey="path" sort={pageSort} className={TH} />
                  <SortHeader label="Pageviews" colKey="pageviews" sort={pageSort} className={`${TH} ${NUM}`} />
                  <SortHeader label="Visitors" colKey="visitors" sort={pageSort} className={`${TH} ${NUM}`} />
                  <SortHeader label="Top source" colKey="source" sort={pageSort} className={TH} />
                </tr>
              </thead>
              <tbody>
                {pageSort.sorted.length === 0 ? (
                  <tr>
                    <td className={`${TD} text-mid-grey-00`} colSpan={4}>
                      No page data.
                    </td>
                  </tr>
                ) : (
                  pageSort.sorted.map((p) => (
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
              Most visited forms
            </Heading>
            <HowToButton target="uar-howto-forms" />
          </div>
          <Text as="p" size="caption" className="mb-s text-mid-grey-00">
            Starts and completion for each form; open one for its funnel,
            per-step drop-off and submit reliability.
          </Text>
          <div className={CARD}>
            <table className="min-w-full">
              <thead>
                <tr>
                  <SortHeader label="Form" colKey="title" sort={formSort} className={TH} />
                  <SortHeader label="Starts" colKey="starts" sort={formSort} className={`${TH} ${NUM}`} />
                  <SortHeader label="Completion" colKey="completion" sort={formSort} className={`${TH} ${NUM}`} />
                </tr>
              </thead>
              <tbody>
                {formSort.sorted.length === 0 ? (
                  <tr>
                    <td className={`${TD} text-mid-grey-00`} colSpan={3}>
                      No forms found.
                    </td>
                  </tr>
                ) : (
                  formSort.sorted.map((f) => (
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
                      <td className={`${TD} ${NUM}`}>{fmtInt(f.starts)}</td>
                      <td className={`${TD} ${NUM}`}>
                        {f.starts ? fmtPct(f.completionPct) : '—'}
                        <span className="text-mid-grey-00">
                          {' '}
                          ({fmtInt(f.completions)})
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* The flow (Sankey) */}
        <FlowDiagram flow={overview.flow} />
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
          Most visited pages — how it works
        </Heading>
        <Text as="p" size="caption" className="mt-xs">
          Most-visited landing pages over the selected range (Umami pageviews).
          <b> Top source</b> lists the leading referrers to each page — hover to
          see all; <code>(direct)</code> = no referrer. Click any column heading
          to sort.
        </Text>
      </div>
      <div id="uar-howto-forms" popover="auto" className="uar-pop">
        <Heading as="h3" size="h5">
          Most visited forms — how it works
        </Heading>
        <Text as="p" size="caption" className="mt-xs">
          <b>Starts</b> = <code>form-start</code> events; <b>Completion</b> =
          successful submits ÷ starts (submit count in brackets), over the
          selected range. Open a form for its distinct-visitor funnel, per-step
          drop-off and submit-error rate. Click any column to sort.
        </Text>
      </div>
    </>
  )
}

// Only the native popover needs raw CSS (it's a top-layer element with a
// backdrop); the rest of the page is design-system components + Tailwind tokens.
const POPOVER_CSS = `
.uar-pop { position: fixed; inset: 0; margin: auto; height: fit-content; max-width: min(460px, 92vw); border: 1px solid var(--color-grey-00); border-radius: 12px; padding: 18px 20px; box-shadow: 0 16px 48px rgba(0,0,0,.22); background: #fff; }
.uar-pop::backdrop { background: rgba(0,0,0,.3); }
.uar-pop code { background: var(--color-teal-10); padding: 1px 5px; border-radius: 4px; }
`
