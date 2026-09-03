/**
 * Seven-row opening-times table, shared by the result card and the detail
 * page. Static content - safe to server-render; only the today emphasis
 * depends on the clock, and it appears after mount ("Today - Monday",
 * highlighted row).
 */

import type { Weekday, WeeklyHours } from '../-data/pharmacies'
import { WEEKDAYS } from '../-data/pharmacies'
import { dayHoursLabel, WEEKDAY_LABELS } from '../-lib/opening-hours'

export function WeeklyHoursRows({
  hours,
  today,
}: {
  hours: WeeklyHours
  today: Weekday | null
}) {
  return (
    <dl className="govbb-text-body m-0 flex flex-col divide-y divide-grey-20">
      {WEEKDAYS.map((weekday) => {
        const isToday = weekday === today
        const label = dayHoursLabel(hours[weekday])
        return (
          <div
            className={`flex items-baseline justify-between gap-s px-xs py-xxs ${
              isToday ? 'bg-blue-10 govbb-text-bold' : ''
            }`}
            key={weekday}
          >
            <dt>
              {isToday
                ? `Today, ${WEEKDAY_LABELS[weekday]}`
                : WEEKDAY_LABELS[weekday]}
            </dt>
            <dd
              className={`m-0 text-right tabular-nums ${
                !isToday && label === 'Closed' ? 'text-grey-70' : ''
              }`}
            >
              {label}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
