// Period-over-period ranges for the Slack /stats command (#3491). Calendar
// aligned in the site timezone, like the presets in dates.ts.
import { startOfDayInTz, tzOffsetMs } from "./dates";
import type { Range } from "./umami";

export const STATS_PERIODS = ["today", "week", "month"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export interface ComparisonPeriods {
  current: Range;
  previous: Range;
}

/**
 * - `today`: today so far vs all of yesterday
 * - `week`: last Monday–Sunday vs the week before
 * - `month`: last calendar month vs the month before
 *
 * Month bounds use the offset at `now`; fine for zones without DST (Barbados).
 */
export function comparisonPeriods(
  period: StatsPeriod,
  timeZone: string,
  now: Date,
): ComparisonPeriods {
  const day = (daysAgo: number) => startOfDayInTz(timeZone, now, daysAgo);
  const span = (startAt: number, nextStartAt: number): Range => ({
    startAt,
    endAt: nextStartAt - 1,
  });

  if (period === "today") {
    return {
      current: { startAt: day(0), endAt: now.getTime() },
      previous: span(day(1), day(0)),
    };
  }

  const off = tzOffsetMs(timeZone, now);
  const wall = new Date(now.getTime() + off);
  if (period === "week") {
    const sinceMonday = (wall.getUTCDay() + 6) % 7;
    return {
      current: span(day(sinceMonday + 7), day(sinceMonday)),
      previous: span(day(sinceMonday + 14), day(sinceMonday + 7)),
    };
  }

  const monthStart = (monthsAgo: number) =>
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() - monthsAgo, 1) - off;
  return {
    current: span(monthStart(1), monthStart(0)),
    previous: span(monthStart(2), monthStart(1)),
  };
}
