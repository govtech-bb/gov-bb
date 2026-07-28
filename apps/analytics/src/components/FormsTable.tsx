import { Link } from '@tanstack/react-router'
import type { FormListItem } from '../lib/umami-server'
import { SortHeader, useTableSort } from './SortableTable'

const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}%`

const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

// Sortable Form / Starts / Completion table. Each row links to the form's detail
// page, preserving the current date range.
export function FormsTable({
  forms,
  range,
}: {
  forms: FormListItem[]
  range: string
}) {
  const sort = useTableSort(
    forms,
    {
      title: (f) => f.title,
      starts: (f) => f.starts,
      completion: (f) => f.completionPct,
    },
    'starts',
    'desc',
  )
  return (
    <div className={CARD}>
      <table className="min-w-full">
        <thead>
          <tr>
            <SortHeader label="Form" colKey="title" sort={sort} className={TH} />
            <SortHeader
              label="Starts"
              colKey="starts"
              sort={sort}
              className={`${TH} ${NUM}`}
            />
            <SortHeader
              label="Completion"
              colKey="completion"
              sort={sort}
              className={`${TH} ${NUM}`}
            />
          </tr>
        </thead>
        <tbody>
          {sort.sorted.length === 0 ? (
            <tr>
              <td className={`${TD} text-mid-grey-00`} colSpan={3}>
                No forms found.
              </td>
            </tr>
          ) : (
            sort.sorted.map((f) => (
              <tr key={f.formId} className="hover:bg-teal-10">
                <td className={TD}>
                  <Link
                    to="/analytics/forms/$formId"
                    params={{ formId: f.formId }}
                    search={{ range }}
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
  )
}
