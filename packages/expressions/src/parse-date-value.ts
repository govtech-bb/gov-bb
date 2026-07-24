import { DateTime } from "luxon";
import { DEFAULT_ZONE } from "./operations/zone";

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/**
 * Canonical date parser shared by `form-validation` (date-comparison rules) and
 * `expressions` (duration / day-count operations) — the single home for the
 * three input shapes a date value can arrive as, validated the same way (#2072):
 *
 *  - `{ day, month, year }` object — the shape a date field stores (#815).
 *  - Barbados `DD/MM/YYYY` — author-typed in the form-builder threshold editor.
 *  - ISO (`YYYY-MM-DD` or full ISO) — submitted / stored values.
 *
 * Returns validated calendar parts, or `null` when the input is absent,
 * malformed, or an **impossible** date (e.g. `31/02`). Every branch validates
 * impossible dates: the object and `DD/MM/YYYY` branches via a `Date.UTC`
 * round-trip (`validParts`), the ISO branch via Luxon's own `isValid`. The
 * object branch previously skipped this and silently rolled `31 Feb` into
 * `2 Mar` (#2072 Bug 1).
 *
 * Timezone-free by design: it only decides which calendar day an input denotes.
 * Each caller builds its own date object in its own zone (form-validation:
 * UTC-midnight native `Date`; expressions: Barbados Luxon), so those deliberately
 * different zone choices are untouched. An ISO time component (date fields don't
 * emit one) is normalised away to the calendar day.
 */
export function parseDateValue(value: unknown): DateParts | null {
  if (!value) return null;

  // Object shape { day, month, year }. Parts are the digit-strings the date
  // input stores, so coerce each explicitly; `validParts` then rejects
  // empty/absent (Number("") is 0), non-numeric (NaN), and literal-zero parts.
  if (
    typeof value === "object" &&
    "day" in value &&
    "month" in value &&
    "year" in value
  ) {
    const o = value as { day: unknown; month: unknown; year: unknown };
    return validParts(Number(o.day), Number(o.month), Number(o.year));
  }

  if (typeof value !== "string") return null;

  // Barbados DD/MM/YYYY (author-typed). ISO uses `-`, so the two never collide;
  // anything without `/` falls through to ISO parsing.
  if (value.includes("/")) {
    const parts = value.split("/");
    if (parts.length !== 3) return null;
    const [dayStr, monthStr, yearStr] = parts;
    // Plain digit runs only (year exactly 4 digits) — rejects the non-canonical
    // numerics `Number` would swallow (hex `0x10`, float `12.5`, padded ` 5 `)
    // and short/typo years that would silently map into the 1900s.
    if (
      !/^\d{1,2}$/.test(dayStr!) ||
      !/^\d{1,2}$/.test(monthStr!) ||
      !/^\d{4}$/.test(yearStr!)
    )
      return null;
    return validParts(Number(dayStr), Number(monthStr), Number(yearStr));
  }

  // ISO (date-only or full). Parse in the default zone and reduce to its
  // calendar day. `fromISO` already rejects impossible dates, so the parts it
  // yields are valid by construction.
  const dt = DateTime.fromISO(value, { zone: DEFAULT_ZONE });
  if (!dt.isValid) return null;
  return { year: dt.year, month: dt.month, day: dt.day };
}

/**
 * Reject falsy parts, then reject impossible dates via a UTC round-trip:
 * `Date.UTC` normalises out-of-range components (`31 Feb` → `2 Mar`), so
 * anything that doesn't round-trip back to its own parts is invalid.
 */
function validParts(
  day: number,
  month: number,
  year: number,
): DateParts | null {
  if (!day || !month || !year) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  )
    return null;
  return { year, month, day };
}
