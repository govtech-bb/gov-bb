import { DateTime } from "luxon";
import { DEFAULT_ZONE } from "./zone";
import { parseDateValue } from "../parse-date-value";

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

// Shared parse (object / DD/MM/YYYY / ISO) → a Barbados-zone DateTime. The
// validated calendar parts come from `parseDateValue` (#2072); we anchor them at
// Barbados midnight here, preserving this package's wall-clock duration
// semantics.
function parseDate(value: unknown): DateTime | null {
  const parts = parseDateValue(value);
  if (!parts) return null;
  return DateTime.fromObject(parts, { zone: DEFAULT_ZONE });
}
