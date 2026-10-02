import { Link } from '@tanstack/react-router'
import type { PageListRow } from '../lib/umami-server'
import { SortHeader, useTableSort } from './SortableTable'

const fmtInt = (n: number) => n.toLocaleString()

const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

// Sortable content-pages table. Default Pageviews desc. A guide page (one with a
// formId) shows a "Form" flag linking through to that form's detail page.
export function PagesTable({
  pages,
  range,
}: {
  pages: PageListRow[]
  range: string
}) {
  const sort = useTableSort(
    pages,
    {
      title: (p) => p.title,
      path: (p) => p.path,
      pageviews: (p) => p.pageviews,
      visitors: (p) => p.visitors,
    },
    'pageviews',
    'desc',
  )
  return (
    <div className={CARD}>
      <table className="min-w-full">
        <thead>
          <tr>
            <SortHeader label="Page" colKey="title" sort={sort} className={TH} />
            <SortHeader label="Path" colKey="path" sort={sort} className={TH} />
            <SortHeader
              label="Pageviews"
              colKey="pageviews"
              sort={sort}
              className={`${TH} ${NUM}`}
            />
            <SortHeader
              label="Visitors"
              colKey="visitors"
              sort={sort}
              className={`${TH} ${NUM}`}
            />
            <th className={TH}>Top source</th>
            <th className={TH}>Form</th>
          </tr>
        </thead>
        <tbody>
          {sort.sorted.length === 0 ? (
            <tr>
              <td className={`${TD} text-mid-grey-00`} colSpan={6}>
                No pages found.
              </td>
            </tr>
          ) : (
            sort.sorted.map((p) => (
              <tr key={p.path} className="hover:bg-teal-10">
                <td className={`${TD} font-bold`}>{p.title}</td>
                <td className={`${TD} text-mid-grey-00`}>{p.path}</td>
                <td className={`${TD} ${NUM}`}>{fmtInt(p.pageviews)}</td>
                <td className={`${TD} ${NUM}`}>{fmtInt(p.visitors)}</td>
                <td className={TD}>{p.topSources[0]?.referrer ?? '—'}</td>
                <td className={TD}>
                  {p.formId ? (
                    <Link
                      to="/analytics/forms/$formId"
                      params={{ formId: p.formId }}
                      search={{ range }}
                      className="text-teal-00 underline"
                    >
                      Form
                    </Link>
                  ) : (
                    <span className="text-mid-grey-00">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
