import { useMemo, useState } from 'react'
import { fmtFullDate, startOfDay } from '../dates'
import { holidaysForYear, type HolidayRuleRecord } from '../holidays'
import type { CalendarBlock } from '../types'
import type { RenderContext } from './spans'

const shortDate = (d: Date) =>
  `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`

export function CalendarIsland({
  block,
  ctx,
  today = new Date(),
}: {
  block: CalendarBlock
  ctx: RenderContext
  today?: Date
}) {
  const rules = (ctx.data[block.collection] ??
    []) as unknown as HolidayRuleRecord[]

  const thisYear = today.getUTCFullYear()
  const [year, setYear] = useState(() =>
    Math.min(Math.max(thisYear, block.year_range.min), block.year_range.max),
  )

  const years = useMemo(() => {
    const out: number[] = []
    for (let y = block.year_range.min; y <= block.year_range.max; y++) out.push(y)
    return out
  }, [block.year_range.min, block.year_range.max])

  const rows = useMemo(() => {
    const all = holidaysForYear(rules, year, block.substitution_rule)
    if (block.show_past) return all
    const cutoff = startOfDay(today)
    return all.filter((holiday) => holiday.date >= cutoff)
  }, [rules, year, block.substitution_rule, block.show_past, today])

  return (
    <div className="bk-calendar">
      <label className="bk-calendar-year">
        Year{' '}
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <table className="bk-table">
        <thead>
          <tr>
            {block.columns.map((column) => (
              <th key={column.field} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((holiday, index) => (
            <tr
              key={`${holiday.name}-${index}`}
              className={holiday.substitute ? 'bk-substitute' : undefined}
            >
              {block.columns.map((column) => {
                if (column.field === 'date') {
                  return (
                    <td key={column.field}>
                      {column.format === 'short_date'
                        ? shortDate(holiday.date)
                        : fmtFullDate(holiday.date)}
                    </td>
                  )
                }
                const value =
                  column.field === 'name'
                    ? holiday.name
                    : column.field === 'note'
                      ? (holiday.note ?? '')
                      : ''
                return <td key={column.field}>{value}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="bk-empty">No holidays left in {year}.</p>
      ) : null}
    </div>
  )
}
