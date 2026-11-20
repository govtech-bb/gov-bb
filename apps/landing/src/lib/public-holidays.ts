import { createServerFn } from '@tanstack/react-start'
import { fetchCollectionRecords } from './api-v2-collections'
import type { RecordValue } from './api-v2-collections'
import { apiV2Base, landingToken } from './api-v2-page'
import { getBankHolidaysForYear, startOfDay } from './bank-holidays'
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
  /** When the record last changed, as api_v2 sends it. */
  updated_at?: string
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

/**
 * The records that are a holiday: a text name, a real date as text and, when
 * there is one, a text note. Any other is left out.
 */
export function oneOffHolidays(
  records: Array<{ data: Record<string, RecordValue>; updated_at?: string }>,
): Array<OneOffHoliday> {
  const text = (value: RecordValue | undefined) =>
    typeof value === 'string' ? value.trim() : undefined
  const holidays: Array<OneOffHoliday> = []
  for (const { data, updated_at } of records) {
    const name = text(data.name)
    const date = text(data.date)
    if (!name || !date || !parseIsoDate(date)) continue
    if (data.note !== undefined && typeof data.note !== 'string') continue
    const note = text(data.note)
    holidays.push({
      date,
      name,
      ...(note && { note }),
      ...(updated_at && { updated_at }),
    })
  }
  return holidays
}

/** Barbados keeps UTC-4 all year (no daylight saving). */
const BARBADOS_OFFSET_MS = -4 * 60 * 60 * 1000

/**
 * The page's "Last updated" day: `pageDate`, or the Barbados day the newest
 * one-off record changed on when that is later.
 */
export function lastUpdated(
  pageDate: Date,
  oneOffs: Array<OneOffHoliday>,
): Date {
  let latest = pageDate
  for (const { updated_at } of oneOffs) {
    const changed = new Date(updated_at ?? '').getTime()
    if (Number.isNaN(changed)) continue
    const day = startOfDay(new Date(changed + BARBADOS_OFFSET_MS))
    if (day > latest) latest = day
  }
  return latest
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
    holidays.push({ date: parsed, name, ...(note && { note }), oneOff: true })
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
  return body ? oneOffHolidays(body.records) : []
}

/** Server function: `resolvePublicHolidays` against the configured api_v2. */
export const getPublicHolidays = createServerFn().handler(() =>
  resolvePublicHolidays(apiV2Base(), fetch, landingToken()),
)
