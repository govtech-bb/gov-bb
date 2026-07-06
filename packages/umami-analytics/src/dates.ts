// Date-range presets that match Umami's dashboard date picker: calendar-day
// aligned in the site timezone (e.g. "Last 7 days" = start-of-day 6 days ago
// → now), NOT a rolling now-minus-N×24h window. Pure + unit-tested so the
// boundaries can be verified without hitting the API.
import type { Range } from "./umami";

const DAY_MS = 86_400_000;

/** ms that `timeZone` is ahead of UTC at the given instant. */
export function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    dtf.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const asUTC = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second,
  );
  return asUTC - date.getTime();
}

/** Epoch ms for the start of the calendar day `daysAgo` days before `now`, in `timeZone`. */
export function startOfDayInTz(
  timeZone: string,
  now: Date,
  daysAgo = 0,
): number {
  const off = tzOffsetMs(timeZone, now);
  const tzNow = new Date(now.getTime() + off);
  const wallMidnight = Date.UTC(
    tzNow.getUTCFullYear(),
    tzNow.getUTCMonth(),
    tzNow.getUTCDate() - daysAgo,
  );
  return wallMidnight - off;
}

export interface DatePreset {
  key: string;
  label: string;
  range: Range;
}

/**
 * The dashboard's presets: "Last N days" spans N calendar days *including
 * today* (start-of-day N-1 days ago → now), so the report's totals line up
 * with what Umami shows for the same picker selection.
 */
export function buildPresets(timeZone: string, now: Date): DatePreset[] {
  const endAt = now.getTime();
  const fromDaysAgo = (days: number): Range => ({
    startAt: startOfDayInTz(timeZone, now, days - 1),
    endAt,
  });
  return [
    {
      key: "today",
      label: "Today",
      range: { startAt: startOfDayInTz(timeZone, now, 0), endAt },
    },
    { key: "last-7-days", label: "Last 7 days", range: fromDaysAgo(7) },
    { key: "last-30-days", label: "Last 30 days", range: fromDaysAgo(30) },
    { key: "last-60-days", label: "Last 60 days", range: fromDaysAgo(60) },
    { key: "last-90-days", label: "Last 90 days", range: fromDaysAgo(90) },
  ];
}

export { DAY_MS };
