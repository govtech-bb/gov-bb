import { DateTime } from "luxon";
import { DEFAULT_ZONE } from "./zone";
import { parseDateValue } from "../parse-date-value";

export function daysBetween(a: unknown, b: unknown): number {
  // Parse via the shared parser so the `{ day, month, year }` object shape that
  // `durationSince` accepts also works here (#2072 Bug 2 — it previously
  // stringified to "[object Object]" → NaN). Both args are anchored at Barbados
  // midnight, matching this package's other date operations.
  const pa = parseDateValue(a);
  const pb = parseDateValue(b);
  if (!pa || !pb) return NaN;
  const da = DateTime.fromObject(pa, { zone: DEFAULT_ZONE });
  const db = DateTime.fromObject(pb, { zone: DEFAULT_ZONE });
  // `round` (not `floor` as in duration-since): daysBetween is a symmetric
  // magnitude between two calendar dates, so partial-day drift rounds to the
  // nearest whole day rather than truncating toward zero.
  return Math.round(Math.abs(da.diff(db, "days").days));
}
