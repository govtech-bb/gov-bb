import type { ToolRow } from '../lib/umami-server'
import { SortHeader, useTableSort } from './SortableTable'

const fmtInt = (n: number) => n.toLocaleString()

const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

// Sortable Tool / Visits / Pageviews / Top source table. No detail page yet
// (out of scope for #2119), so the tool name is plain text with its route shown
// beneath. Defaults to Pageviews descending.
export function ToolsTable({ tools }: { tools: ToolRow[] }) {
  const sort = useTableSort(
    tools,
    {
      name: (t) => t.name,
      visitors: (t) => t.visitors,
      pageviews: (t) => t.pageviews,
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
              <th className={TH}>Top source</th>
            </tr>
          </thead>
          <tbody>
            {sort.sorted.length === 0 ? (
              <tr>
                <td className={`${TD} text-mid-grey-00`} colSpan={4}>
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
    </>
  )
}
