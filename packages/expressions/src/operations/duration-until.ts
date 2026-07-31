import { DateTime } from "luxon";
import { parseDate } from "./parse-date";
import type { DurationUnit } from "./duration-since";
import { DEFAULT_ZONE } from "./zone";

/**
 * Whole-unit duration from now up to a future date (Barbados wall-clock),
 * truncated to an integer — the future-facing counterpart of `durationSince`.
 * The lead-time gate behind rules like `min: 14, transform: "daysUntil"`.
 *
 * Measured from the **start of the current day**, not the current instant, so a
 * date that is genuinely N calendar days ahead counts as N regardless of the
 * time of day the form is filled. (A naive `date.diff(now)` would floor a
 * date exactly 14 days ahead to 13 whenever `now` is past midnight.) A past
 * date yields a negative count; today yields 0.
 *
 * Accepts either an ISO date string or the `{ day, month, year }` DateValue
 * object a date field stores. Invalid/empty input → NaN, so callers can treat a
 * missing or malformed date as validation-fail (NaN fails every numeric bound).
 */
export function durationUntil(date: unknown, unit: DurationUnit): number {
  if (date == null) return NaN;
  const dt = parseDate(date);
  if (dt === null || !dt.isValid) return NaN;
  const startOfToday = DateTime.now().setZone(DEFAULT_ZONE).startOf("day");
  return Math.floor(dt.startOf("day").diff(startOfToday, unit).as(unit));
}
