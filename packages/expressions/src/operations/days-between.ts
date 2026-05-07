import { DateTime } from "luxon";
import { DEFAULT_ZONE } from "./zone";

export function daysBetween(a: unknown, b: unknown): number {
  const da = DateTime.fromISO(String(a), { zone: DEFAULT_ZONE });
  const db = DateTime.fromISO(String(b), { zone: DEFAULT_ZONE });
  if (!da.isValid || !db.isValid) return NaN;
  return Math.round(Math.abs(da.diff(db, "days").days));
}
