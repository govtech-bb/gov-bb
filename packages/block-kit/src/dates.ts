/**
 * Date arithmetic, ported VERBATIM from
 * apps/landing/src/lib/bank-holidays.ts.
 *
 * Do not rewrite any of this. The anonymous Gregorian algorithm in
 * `easterSunday` is exactly the kind of code that looks right and is subtly
 * wrong for two years out of thirty; `holidays.test.ts` pins the rule engine
 * built on top of it against the original generator for every year in range.
 *
 * This is the "formulas are code" half of the data/code split: the rules are
 * editable rows, this arithmetic is not editable by anyone but a developer.
 */

export const MIN_YEAR = 2020
export const MAX_YEAR = 2050

/** Anonymous Gregorian algorithm — works for any year ≥ 1583. */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const L = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * L) / 451)
  const month = Math.floor((h + L - 7 * m + 114) / 31)
  const day = ((h + L - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

/** Returns the date of the Nth occurrence of `weekday` in the given month. */
export function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  n: number,
): Date {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1))
  const offset = (weekday - firstOfMonth.getUTCDay() + 7) % 7
  return new Date(Date.UTC(year, monthIndex, 1 + offset + (n - 1) * 7))
}

export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday',
  'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

export const fmtMonthShort = (d: Date) =>
  MONTHS_SHORT[d.getUTCMonth()].toUpperCase()
export const fmtDayNum = (d: Date) => d.getUTCDate()
export const fmtDayOfWeek = (d: Date) => DAYS_LONG[d.getUTCDay()]
export const fmtFullDate = (d: Date) =>
  `${DAYS_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`
export const fmtSubstituteDate = (d: Date) =>
  `${DAYS_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`
