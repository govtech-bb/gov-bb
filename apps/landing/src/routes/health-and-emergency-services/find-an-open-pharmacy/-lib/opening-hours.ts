/**
 * Opening-hours logic for the pharmacy finder.
 * --------------------------------------------------------------
 * Pure functions over the WeeklyHours model: where an instant falls on the
 * Barbados wall clock, whether a pharmacy is open at that moment, and the
 * display formatting for times and daily hours. Every entry point takes the
 * current instant as an argument so tests inject fixed dates.
 */

import { getBankHolidaysForYear, startOfDay } from '@/lib/bank-holidays'
import type {
  Pharmacy,
  TimeRange,
  Weekday,
  WeeklyHours,
} from '../-data/pharmacies'
import { WEEKDAYS } from '../-data/pharmacies'

/** UTC-4 year-round - Barbados has no daylight saving time. */
export const BARBADOS_TIME_ZONE = 'America/Barbados'

export const WEEKDAY_LABELS = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
} satisfies Record<Weekday, string>

/** 'HH:MM' → minutes since midnight ('24:00' → 1440). */
export function toMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Where an instant falls on the Barbados wall clock. */
export interface WallClock {
  weekday: Weekday
  /** Minutes since midnight, 0–1439. */
  minutes: number
}

// hourCycle 'h23' (not hour12: false) so midnight formats as '00', never '24'.
const WALL_CLOCK_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: BARBADOS_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function barbadosWallClock(now: Date): WallClock {
  const parts = new Map(
    WALL_CLOCK_FORMAT.formatToParts(now).map((part) => [part.type, part.value]),
  )
  const weekday = (parts.get('weekday') ?? '').toLowerCase() as Weekday
  return {
    weekday,
    minutes: Number(parts.get('hour')) * 60 + Number(parts.get('minute')),
  }
}

export type OpenStatus =
  | { open: true; closes: string }
  | {
      open: false
      /** Next confirmed opening within 7 days, if known. */
      nextOpen?: { weekday: Weekday; opens: string; isToday: boolean }
    }

export interface UpcomingOpening {
  pharmacy: Pharmacy
  weekday: Weekday
  opens: string
  isToday: boolean
}

/**
 * Among the given pharmacies, the one that opens soonest after `now`
 * (currently open ones are skipped). Null when none has upcoming hours.
 */
export function soonestOpening(
  pharmacies: ReadonlyArray<Pharmacy>,
  now: Date,
): UpcomingOpening | null {
  const at = barbadosWallClock(now)
  const todayIndex = WEEKDAYS.indexOf(at.weekday)
  let best: UpcomingOpening | null = null
  let bestRank = Number.POSITIVE_INFINITY

  for (const pharmacy of pharmacies) {
    const status = pharmacyStatus(pharmacy, now)
    if (!status || status.open || !status.nextOpen) continue
    const { weekday, opens, isToday } = status.nextOpen
    const dayOffset = isToday
      ? 0
      : (WEEKDAYS.indexOf(weekday) - todayIndex + 7) % 7 || 7
    const rank = dayOffset * 1440 + toMinutes(opens)
    if (rank < bestRank) {
      bestRank = rank
      best = { pharmacy, weekday, opens, isToday }
    }
  }

  return best
}

/**
 * The card's single entry point: status of a pharmacy at an instant, or
 * null when its opening hours are not confirmed (open/closed unknown).
 */
export function pharmacyStatus(
  pharmacy: Pharmacy,
  now: Date,
): OpenStatus | null {
  if (!pharmacy.hours) return null
  const hours = pharmacy.hours
  const at = barbadosWallClock(now)
  const todayIndex = WEEKDAYS.indexOf(at.weekday)
  const rangesAt = (offset: number) => {
    const day = new Date(now.getTime() + offset * 86_400_000)
    if (isBankHoliday(day)) {
      return pharmacy.bankHolidayHours ?? null
    }
    return hours[WEEKDAYS[(todayIndex + offset) % 7]]
  }
  const today = rangesAt(0)
  if (today === null) return null
  for (const range of today) {
    if (
      toMinutes(range.opens) <= at.minutes &&
      at.minutes < toMinutes(range.closes)
    ) {
      return { open: true, closes: range.closes }
    }
  }

  // Offset 7 is the same weekday next week, for a pharmacy whose only
  // remaining hours this week are earlier today.
  for (let offset = 0; offset <= 7; offset++) {
    const weekday = WEEKDAYS[(todayIndex + offset) % 7]
    const ranges = offset === 0 ? today : rangesAt(offset)
    // An unknown intervening day prevents a definite "next opening" claim.
    if (ranges === null) return { open: false }
    for (const range of ranges) {
      if (offset === 0 && toMinutes(range.opens) <= at.minutes) continue
      return {
        open: false,
        nextOpen: { weekday, opens: range.opens, isToday: offset === 0 },
      }
    }
  }

  return { open: false }
}

export function isBankHoliday(now: Date): boolean {
  // Match the existing UTC calendar to Barbados's local date (UTC-4).
  const day = startOfDay(new Date(now.getTime() - 4 * 60 * 60_000))
  return getBankHolidaysForYear(day.getUTCFullYear()).some(
    (holiday) => holiday.date.getTime() === day.getTime(),
  )
}

/**
 * 'HH:MM' → '8:00 am' / '1:30 pm'; '12:00' → 'midday', '00:00' and '24:00' →
 * 'midnight' (GOV.UK style - no ambiguous 12 am/12 pm).
 */
export function formatTime(time: string): string {
  const minutes = toMinutes(time)
  if (minutes === 0 || minutes === 1440) return 'midnight'
  if (minutes === 720) return 'midday'
  const hour24 = Math.floor(minutes / 60)
  const minute = String(minutes % 60).padStart(2, '0')
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${minute} ${hour24 < 12 ? 'am' : 'pm'}`
}

/** Compact time for the card's one-line hours: '8am', '8:15am', 'midday'. */
export function formatTimeShort(time: string): string {
  const minutes = toMinutes(time)
  if (minutes === 0 || minutes === 1440) return 'midnight'
  if (minutes === 720) return 'midday'
  const hour24 = Math.floor(minutes / 60)
  const minute = minutes % 60
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const mm = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  return `${hour12}${mm}${hour24 < 12 ? 'am' : 'pm'}`
}

const SHORT_DAY_LABELS = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
} satisfies Record<Weekday, string>

function shortRanges(ranges: ReadonlyArray<TimeRange>): string {
  return ranges
    .map((range) =>
      toMinutes(range.opens) === 0 && toMinutes(range.closes) === 1440
        ? '24 hours'
        : `${formatTimeShort(range.opens)}–${formatTimeShort(range.closes)}`,
    )
    .join(' & ')
}

/**
 * The whole week on one line for the result card: consecutive days with
 * identical hours are grouped - 'Mon–Fri 8:15am–10pm · Sat 8:15am–4:30pm'.
 * Closed days are omitted.
 */
export function weeklyHoursSummary(hours: WeeklyHours): string {
  const parts: string[] = []
  let runStart: Weekday | null = null
  let runEnd: Weekday | null = null
  let runKey = ''

  const flush = () => {
    if (!runStart || !runEnd) return
    const label =
      runStart === runEnd
        ? SHORT_DAY_LABELS[runStart]
        : `${SHORT_DAY_LABELS[runStart]}–${SHORT_DAY_LABELS[runEnd]}`
    parts.push(`${label} ${runKey}`)
  }

  for (const weekday of WEEKDAYS) {
    const ranges = hours[weekday]
    if (ranges.length === 0) {
      flush()
      runStart = null
      runEnd = null
      continue
    }
    const key = shortRanges(ranges)
    if (runStart && key === runKey) {
      runEnd = weekday
    } else {
      flush()
      runStart = weekday
      runEnd = weekday
      runKey = key
    }
  }
  flush()

  return parts.length > 0 ? parts.join(' · ') : 'Closed all week'
}

/**
 * One day's ranges → display label: '8:00 am to 6:00 pm', split shifts
 * joined with 'and', 'Open 24 hours', or 'Closed'.
 */
export function dayHoursLabel(ranges: ReadonlyArray<TimeRange>): string {
  if (ranges.length === 0) return 'Closed'
  if (
    ranges.length === 1 &&
    ranges[0] &&
    toMinutes(ranges[0].opens) === 0 &&
    toMinutes(ranges[0].closes) === 1440
  ) {
    return 'Open 24 hours'
  }
  return ranges
    .map((range) => `${formatTime(range.opens)} to ${formatTime(range.closes)}`)
    .join(' and ')
}
