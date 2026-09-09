/**
 * Seven-row opening-times table, shared by the result card and the detail
 * page. Static content - safe to server-render; only the today emphasis
 * depends on the clock, and it appears after mount ("Today - Monday",
 * highlighted row).
 */

import type {
  Pharmacy,
  PharmacyContent,
  Weekday,
  WeeklyHours,
} from '../-data/pharmacies'
import { PHARMACY_CONTENT, WEEKDAYS } from '../-data/pharmacies'
import { formatCopy } from '../-lib/copy'
import { dayHoursLabel, WEEKDAY_LABELS } from '../-lib/opening-hours'

export function WeeklyHoursRows({
  hours,
  today,
  todayIsHoliday,
  bankHolidayHours,
  content = PHARMACY_CONTENT,
}: {
  hours: WeeklyHours
  today: Weekday | null
  todayIsHoliday: boolean
  bankHolidayHours: Pharmacy['bankHolidayHours']
  content?: PharmacyContent
}) {
  const copy = content.copy.hours
  return (
    <dl className="govbb-text-body m-0 flex flex-col divide-y divide-grey-20">
      {WEEKDAYS.map((weekday) => {
        const isToday = weekday === today && !todayIsHoliday
        const label =
          hours[weekday].length === 0
            ? copy.closed
            : dayHoursLabel(hours[weekday])
        return (
          <div
            className={`flex items-baseline justify-between gap-s px-xs py-xxs ${
              isToday ? 'bg-blue-10 govbb-text-bold' : ''
            }`}
            key={weekday}
          >
            <dt>
              {isToday
                ? formatCopy(copy.todayLabel, { day: WEEKDAY_LABELS[weekday] })
                : WEEKDAY_LABELS[weekday]}
            </dt>
            <dd
              className={`m-0 text-right tabular-nums ${
                !isToday && hours[weekday].length === 0 ? 'text-grey-70' : ''
              }`}
            >
              {label}
            </dd>
          </div>
        )
      })}
      <div
        className={`flex items-baseline justify-between gap-s px-xs py-xxs ${todayIsHoliday ? 'bg-blue-10 govbb-text-bold' : ''}`}
      >
        <dt>{todayIsHoliday ? copy.publicHolidayToday : copy.publicHoliday}</dt>
        <dd className="m-0 text-right tabular-nums">
          {bankHolidayHours
            ? bankHolidayHours.length === 0
              ? copy.closed
              : dayHoursLabel(bankHolidayHours)
            : copy.unknownHoliday}
        </dd>
      </div>
    </dl>
  )
}
