export interface Holiday {
  date: Date
  name: string
  note?: string
  /** True when this row is a "Monday/Tuesday in lieu" substitution. */
  substitute?: boolean
}

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
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const DAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export const fmtMonthShort = (d: Date) =>
  MONTHS_SHORT[d.getUTCMonth()].toUpperCase()
export const fmtDayNum = (d: Date) => d.getUTCDate()
export const fmtDayOfWeek = (d: Date) => DAYS_LONG[d.getUTCDay()]
export const fmtFullDate = (d: Date) =>
  `${DAYS_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`
export const fmtSubstituteDate = (d: Date) =>
  `${DAYS_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`

/**
 * Returns the 12 statutory public holidays for a given year as defined in the
 * First Schedule of the Public Holidays Act, Cap. 352 (Barbados), plus any
 * substitution days triggered by the rules at the foot of that Schedule.
 *
 * Substitution rules — verbatim from First Schedule, Cap. 352:
 *   (a) "in any year the 1st January, the 21st January, the 28th April,
 *       the 1st May, the 30th November or the 26th December falls on a
 *       Sunday, the next following Monday shall be a public holiday"
 *   (b) "in any year the 1st August falls on a Sunday or a Monday, the
 *       next following Tuesday shall be a public holiday"
 *   (c) "in any year the 25th December falls on a Sunday, the next
 *       following Tuesday shall be a public holiday"
 *
 * Government-declared one-off public holidays are NOT included here; those
 * should be added via the CMS / data layer rather than this generator.
 */
export function getBankHolidaysForYear(year: number): Array<Holiday> {
  const easter = easterSunday(year)

  const fixed: Array<Holiday> = [
    { date: new Date(Date.UTC(year, 0, 1)), name: "New Year's Day" },
    {
      date: new Date(Date.UTC(year, 0, 21)),
      name: 'Errol Barrow Day',
      note: 'Honouring the first Prime Minister of Barbados',
    },
    { date: addDays(easter, -2), name: 'Good Friday' },
    { date: addDays(easter, 1), name: 'Easter Monday' },
    {
      date: new Date(Date.UTC(year, 3, 28)),
      name: 'National Heroes Day',
      note: "Honouring Barbados's ten official National Heroes",
    },
    {
      date: new Date(Date.UTC(year, 4, 1)),
      name: 'Labour Day',
      note: "International Workers' Day",
    },
    {
      date: addDays(easter, 50),
      name: 'Whit Monday',
      note: '7th Monday after Easter',
    },
    {
      date: new Date(Date.UTC(year, 7, 1)),
      name: 'Emancipation Day',
      note: 'Marking the abolition of slavery in 1834',
    },
    {
      date: nthWeekdayOfMonth(year, 7, 1, 1),
      name: 'Kadooment Day',
      note: 'Climax of the Crop Over Festival',
    },
    {
      date: new Date(Date.UTC(year, 10, 30)),
      name: 'Independence Day',
      note: 'National Day',
    },
    { date: new Date(Date.UTC(year, 11, 25)), name: 'Christmas Day' },
    { date: new Date(Date.UTC(year, 11, 26)), name: 'Boxing Day' },
  ]

  const mondayInLieuNames = new Set([
    "New Year's Day",
    'Errol Barrow Day',
    'National Heroes Day',
    'Labour Day',
    'Independence Day',
    'Boxing Day',
  ])

  const substitutes: Array<Holiday> = []
  for (const h of fixed) {
    const dow = h.date.getUTCDay()

    if (mondayInLieuNames.has(h.name) && dow === 0) {
      substitutes.push({
        date: addDays(h.date, 1),
        name: `Public Holiday in lieu of ${h.name}`,
        substitute: true,
      })
    }

    if (h.name === 'Emancipation Day' && (dow === 0 || dow === 1)) {
      substitutes.push({
        date: addDays(h.date, dow === 0 ? 2 : 1),
        name: 'Public Holiday in lieu of Emancipation Day',
        substitute: true,
      })
    }

    if (h.name === 'Christmas Day' && dow === 0) {
      substitutes.push({
        date: addDays(h.date, 2),
        name: 'Public Holiday in lieu of Christmas Day',
        substitute: true,
      })
    }
  }

  return [...fixed, ...substitutes].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  )
}
