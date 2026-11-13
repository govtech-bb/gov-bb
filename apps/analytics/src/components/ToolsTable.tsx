import type { ToolRow } from '../lib/umami-server'
import { SortHeader, useTableSort } from './SortableTable'

const fmtInt = (n: number) => n.toLocaleString()
// A 0–1 rate as a percentage, 1dp without a trailing ".0"; a dash when the
// tool has no data for it.
const fmtRate = (r: number | null) =>
  r == null ? '—' : `${(r * 100).toFixed(1).replace(/\.0$/, '')}%`

const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

// Sortable Tool / Visits / Pageviews / Results table, with each tool's event
// metrics (ADR 0138) and top source. No detail page yet (out of scope for
// #2119), so the tool name is plain text with its route shown beneath.
// Defaults to Pageviews descending.
export function ToolsTable({ tools }: { tools: ToolRow[] }) {
  const sort = useTableSort(
    tools,
    {
      name: (t) => t.name,
      visitors: (t) => t.visitors,
      pageviews: (t) => t.pageviews,
      results: (t) => t.events?.results ?? 0,
    },
    'pageviews',
    'desc',
  )
  return (
    <>
      <div className={CARD}>
        <table className="min-w-full">
          <thead>
            <tr>
              <SortHeader label="Tool" colKey="name" sort={sort} className={TH} />
              <SortHeader
                label="Visits"
                colKey="visitors"
                sort={sort}
                className={`${TH} ${NUM}`}
              />
              <SortHeader
                label="Pageviews"
                colKey="pageviews"
                sort={sort}
                className={`${TH} ${NUM}`}
              />
              <SortHeader
                label="Results"
                colKey="results"
                sort={sort}
                className={`${TH} ${NUM}`}
              />
              <th className={`${TH} ${NUM}`}>No result</th>
              <th className={TH}>Top action</th>
              <th className={`${TH} ${NUM}`}>Error rate</th>
              <th className={TH}>Top source</th>
            </tr>
          </thead>
          <tbody>
            {sort.sorted.length === 0 ? (
              <tr>
                <td className={`${TD} text-mid-grey-00`} colSpan={8}>
                  No tools found.
                </td>
              </tr>
            ) : (
              sort.sorted.map((t) => (
                <tr key={t.path} className="hover:bg-teal-10">
                  <td className={TD}>
                    <span className="font-bold">{t.name}</span>
                    <span className="block text-mid-grey-00">{t.path}</span>
                  </td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(t.visitors)}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(t.pageviews)}</td>
                  {t.events ? (
                    <>
                      <td className={`${TD} ${NUM}`}>
                        {fmtInt(t.events.results)}
                      </td>
                      <td className={`${TD} ${NUM}`}>
                        {fmtRate(t.events.noResultRate)}
                      </td>
                      <td className={TD}>
                        {t.events.topAction
                          ? `${t.events.topAction.action} (${fmtInt(t.events.topAction.count)})`
                          : '—'}
                      </td>
                      <td className={`${TD} ${NUM}`}>
                        {fmtRate(t.events.errorRate)}
                      </td>
                    </>
                  ) : (
                    <td className={`${TD} text-mid-grey-00`} colSpan={4}>
                      No tool events in this period
                    </td>
                  )}
                  <td className={TD}>{t.topSources[0]?.referrer ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-s text-caption text-mid-grey-00">
        Visits are summed across a tool&apos;s sub-pages, so a visitor who views
        more than one page of a multi-step tool may be counted more than once.
      </p>
      <p className="mt-xs text-caption text-mid-grey-00">
        Results, No result, Top action and Error rate come from each tool&apos;s
        own events. No result is the share of results where the visitor found
        nothing or was not eligible. Error rate is errors ÷ (results + errors).
        A dash means there is nothing to measure. A tool that sent no events
        shows &ldquo;No tool events in this period&rdquo;.
      </p>
    </>
  )
}
