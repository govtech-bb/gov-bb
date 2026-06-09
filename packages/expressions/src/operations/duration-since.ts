import { DateTime } from "luxon";
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

function parseDate(value: unknown): DateTime | null {
  if (isDateValue(value)) {
    const day = Number(value.day);
    const month = Number(value.month);
    const year = Number(value.year);
    if (!day || !month || !year) return null;
    return DateTime.fromObject({ day, month, year }, { zone: DEFAULT_ZONE });
  }
  // Date-only ("YYYY-MM-DD") and full ISO both supported.
  return DateTime.fromISO(String(value), { zone: DEFAULT_ZONE });
}

function isDateValue(
  value: unknown,
): value is { day: unknown; month: unknown; year: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "day" in value &&
    "month" in value &&
    "year" in value
  );
}
