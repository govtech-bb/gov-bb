import { DateTime } from "luxon";
import { DEFAULT_ZONE } from "./zone";
import { parseDateValue } from "../parse-date-value";

/**
 * Parse the date shapes the form engines pass around — the `{ day, month, year }`
 * DateValue object a date field stores, Barbados `DD/MM/YYYY`, or an ISO string
 * ("YYYY-MM-DD" or full ISO) — into a Luxon `DateTime` in the Barbados zone.
 * Returns `null` for a missing/incomplete/unparseable value so callers can treat
 * it as condition-not-met / validation-fail. Shared by `durationSince` and
 * `durationUntil` so the parsing lives in one place.
 *
 * Shape-parsing and validation are delegated to the canonical `parseDateValue`
 * (#2072), so every branch rejects impossible dates (e.g. `31 Feb`) instead of
 * silently rolling them forward; the validated calendar parts are then anchored
 * at Barbados midnight here, preserving this package's wall-clock semantics.
 */
export function parseDate(value: unknown): DateTime | null {
  const parts = parseDateValue(value);
  if (!parts) return null;
  return DateTime.fromObject(parts, { zone: DEFAULT_ZONE });
}
