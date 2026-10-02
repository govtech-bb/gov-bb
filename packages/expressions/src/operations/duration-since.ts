import { DateTime } from "luxon";
import { parseDate } from "./parse-date";
import { DEFAULT_ZONE } from "./zone";

export type DurationUnit = "years" | "months" | "days";

/**
 * Whole-unit duration from a date up to now (Barbados wall-clock), truncated to
 * an integer. The shared primitive behind age-style gating: a DOB 24y 11m in
 * the past yields 24, not 25. Invalid/empty input → NaN, so callers can treat a
 * missing or malformed date as condition-not-met / validation-fail.
 *
 * Accepts either an ISO date string or the `{ day, month, year }` DateValue
 * object a date field stores — the conditional and validation engines pass the
 * raw resolved value straight through, so the date parsing lives here once.
 */
export function durationSince(date: unknown, unit: DurationUnit): number {
  if (date == null) return NaN;
  const dt = parseDate(date);
  if (dt === null || !dt.isValid) return NaN;
  const now = DateTime.now().setZone(DEFAULT_ZONE);
  return Math.floor(now.diff(dt, unit).as(unit));
}
