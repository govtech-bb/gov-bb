import { Heading, Text } from '@govtech-bb/react'
import * as React from 'react'
import { FlowDiagram } from './FlowDiagram'
import type { FlowData, JourneyRow } from './lib/umami-server'

const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (frac: number) =>
  `${(frac * 100).toFixed(1).replace(/\.0$/, '')}%`

const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'

// "Most common journeys" with two views: the Sankey flowchart and a ranked
// breadcrumb table. Rendered on the overview, which supplies the .uar-pop
// popover styles used by the "How it works" button.
export function JourneysSection({
  flow,
  journeys,
}: {
  flow: FlowData
  journeys: JourneyRow[]
}) {
  const [view, setView] = React.useState<'flow' | 'table'>('flow')
  return (
    <section className="mb-l">
      <div className="mb-s flex items-center justify-between gap-s">
        <Heading as="h2" size="h3">
          Most common journeys
        </Heading>
        <button
          type="button"
          popoverTarget="uar-howto-journeys"
          className="rounded-full border border-grey-00 px-s py-xs text-caption font-bold text-teal-00"
        >
          How it works
        </button>
      </div>

      <div role="tablist" className="mb-s flex gap-xs border-b border-grey-00">
        {(['flow', 'table'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`-mb-px border-b-2 px-s py-xs text-caption transition-colors ${
              view === v
                ? 'border-teal-00 font-bold text-teal-00'
                : 'border-transparent text-mid-grey-00 hover:text-teal-00'
            }`}
          >
            {v === 'flow' ? 'Flowchart' : 'Table'}
          </button>
        ))}
      </div>

      {view === 'flow' ? (
        <FlowDiagram flow={flow} />
      ) : (
        <JourneyTable journeys={journeys} />
      )}

      <div id="uar-howto-journeys" popover="auto" className="uar-pop">
        <Heading as="h3" size="h5">
          Most common journeys — how it works
        </Heading>
        <Text as="p" size="caption" className="mt-xs">
          The paths visitors take through the first few steps of a visit, from
          Umami's journey report (page navigation). The <b>Flowchart</b> is a
          Sankey that aggregates step-to-step <em>transitions</em> (ribbon width =
          visits), so a common step shows even if the full paths differ. The{' '}
          <b>Table</b> lists the top <em>complete</em> multi-step journeys (exact
          sequences), with session counts and share; single-page visits (bounces)
          are excluded. Because one aggregates transitions and the other exact
          sequences, their ordering differs. <code>Start</code>/<code>Form</code>{' '}
          are the service's start and form pages.
        </Text>
      </div>
    </section>
  )
}

function JourneyTable({ journeys }: { journeys: JourneyRow[] }) {
  if (journeys.length === 0) {
    return (
      <Text as="p" size="caption" className="text-mid-grey-00">
        No journey data in this range.
      </Text>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-grey-00">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className={`${TH} ${NUM}`}>#</th>
            <th className={TH}>Journey</th>
            <th className={`${TH} ${NUM}`}>Sessions</th>
            <th className={`${TH} ${NUM}`}>Share</th>
          </tr>
        </thead>
        <tbody>
          {journeys.map((j, i) => (
            <tr key={j.items.join('>')}>
              <td className={`${TD} ${NUM} text-mid-grey-00`}>{i + 1}</td>
              <td className={TD}>
                <span className="flex flex-wrap items-center gap-xs">
                  {j.items.map((step, k) => (
                    <React.Fragment key={k}>
                      {k > 0 ? (
                        <span aria-hidden="true" className="text-mid-grey-00">
                          ›
                        </span>
                      ) : null}
                      <span className="inline-flex items-center rounded-sm bg-blue-10 px-[6px] py-[1px] text-blue-00">
                        {step}
                      </span>
                    </React.Fragment>
                  ))}
                </span>
              </td>
              <td className={`${TD} ${NUM}`}>{fmtInt(j.sessions)}</td>
              <td className={`${TD} ${NUM}`}>{fmtPct(j.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
