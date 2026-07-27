import { DateTime } from "luxon";
import { DEFAULT_ZONE } from "./zone";

/**
 * Parse the two date shapes the form engines pass around — an ISO string
 * ("YYYY-MM-DD" or full ISO) or the `{ day, month, year }` DateValue object a
 * date field stores — into a Luxon `DateTime` in the Barbados zone. Returns
 * `null` for a missing/incomplete/unparseable value so callers can treat it as
 * condition-not-met / validation-fail. Shared by `durationSince` and
 * `durationUntil` so the parsing lives in one place.
 */
export function parseDate(value: unknown): DateTime | null {
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
