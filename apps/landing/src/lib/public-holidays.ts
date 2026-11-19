import { createServerFn } from '@tanstack/react-start'
import { fetchCollectionRecords } from './api-v2-collections'
import { apiV2Base, landingToken } from './api-v2-page'
import { getBankHolidaysForYear } from './bank-holidays'
import type { Holiday } from './bank-holidays'

/**
 * One-off public holidays the Government declares, read from api_v2's
 * `public-holidays` data collection at request time (#3205), so a new one
 * shows on the bank holiday calendar with no deploy. The statutory holidays
 * and their substitution days are still calculated here (bank-holidays.ts).
 * A missing collection, or a failed read, adds nothing: the calendar then
 * shows the calculated holidays only.
 */

const PUBLIC_HOLIDAYS_COLLECTION = 'public-holidays'

/** A one-off holiday, its date as `YYYY-MM-DD`: a string, so it crosses the server fn as is. */
export interface OneOffHoliday {
  date: string
  name: string
  note?: string
}

/** The UTC date `YYYY-MM-DD` names, or null when it isn't a real date. */
export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Date.UTC rolls 30 February over to March: a date that moved isn't one.
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null
}

/** The records that are a holiday: a name and a real date. Any other is left out. */
export function oneOffHolidays(
  records: Array<Record<string, string>>,
): Array<OneOffHoliday> {
  const holidays: Array<OneOffHoliday> = []
  for (const record of records) {
    const name = record.name?.trim()
    const date = record.date?.trim()
    if (!name || !date || !parseIsoDate(date)) continue
    const note = record.note?.trim()
    holidays.push(note ? { date, name, note } : { date, name })
  }
  return holidays
}

/**
 * The year's calculated holidays with its one-off holidays, sorted by date.
 * A one-off holiday brings no substitution day, and one already listed (same
 * date and name) isn't listed again.
 */
export function holidaysForYear(
  year: number,
  oneOffs: Array<OneOffHoliday>,
): Array<Holiday> {
  const holidays = getBankHolidaysForYear(year)
  const listed = new Set(holidays.map((h) => `${h.date.getTime()} ${h.name}`))
  for (const { date, name, note } of oneOffs) {
    const parsed = parseIsoDate(date)
    if (parsed?.getUTCFullYear() !== year) continue
    const id = `${parsed.getTime()} ${name}`
    if (listed.has(id)) continue
    listed.add(id)
    holidays.push(note ? { date: parsed, name, note } : { date: parsed, name })
  }
  return holidays.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** The collection's holidays, or none when api_v2 isn't configured or the read fails. */
export async function resolvePublicHolidays(
  base: string | null,
  fetchImpl: typeof fetch = fetch,
  landingToken?: string,
): Promise<Array<OneOffHoliday>> {
  if (!base) return []
  const body = await fetchCollectionRecords(
    base,
    PUBLIC_HOLIDAYS_COLLECTION,
    fetchImpl,
    landingToken,
  )
  return body ? oneOffHolidays(body.records.map((row) => row.data)) : []
}

/** Server function: `resolvePublicHolidays` against the configured api_v2. */
export const getPublicHolidays = createServerFn().handler(() =>
  resolvePublicHolidays(apiV2Base(), fetch, landingToken()),
)
