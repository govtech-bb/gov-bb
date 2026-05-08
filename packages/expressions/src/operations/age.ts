import { DateTime } from "luxon";
import { DEFAULT_ZONE } from "./zone";

export function age(dob: unknown): number {
  if (dob == null) return NaN;
  const dt = parseDob(String(dob));
  if (!dt.isValid) return NaN;
  const now = DateTime.now().setZone(DEFAULT_ZONE);
  return Math.floor(now.diff(dt, "years").years);
}

function parseDob(s: string): DateTime {
  // Date-only ("YYYY-MM-DD") and full ISO both supported.
  return DateTime.fromISO(s, { zone: DEFAULT_ZONE });
}
