/**
 * The ORIGINAL generator from apps/landing/src/lib/bank-holidays.ts, copied
 * verbatim (only the local `addDays`/`nthWeekdayOfMonth` imports differ).
 *
 * Nothing in the spike renders from this. It exists so the rule engine in
 * `holidays.ts` can be pinned against it for every year in MIN_YEAR..MAX_YEAR
 * — the one check that proves moving the holiday list from code into editable
 * rows did not silently change a single date.
 *
 * Substitution rules — verbatim from First Schedule, Cap. 352:
 *   (a) "in any year the 1st January, the 21st January, the 28th April,
 *       the 1st May, the 30th November or the 26th December falls on a
 *       Sunday, the next following Monday shall be a public holiday"
 *   (b) "in any year the 1st August falls on a Sunday or a Monday, the
 *       next following Tuesday shall be a public holiday"
 *   (c) "in any year the 25th December falls on a Sunday, the next
 *       following Tuesday shall be a public holiday"
 */

import { addDays, easterSunday, nthWeekdayOfMonth } from "./dates";
import type { Holiday } from "./holidays";

export function referenceHolidaysForYear(year: number): Array<Holiday> {
  const easter = easterSunday(year);

  const fixed: Array<Holiday> = [
    { date: new Date(Date.UTC(year, 0, 1)), name: "New Year's Day" },
    {
      date: new Date(Date.UTC(year, 0, 21)),
      name: "Errol Barrow Day",
      note: "Honouring the first Prime Minister of Barbados",
    },
    { date: addDays(easter, -2), name: "Good Friday" },
    { date: addDays(easter, 1), name: "Easter Monday" },
    {
      date: new Date(Date.UTC(year, 3, 28)),
      name: "National Heroes Day",
      note: "Honouring Barbados's ten official National Heroes",
    },
    {
      date: new Date(Date.UTC(year, 4, 1)),
      name: "Labour Day",
      note: "International Workers' Day",
    },
    {
      date: addDays(easter, 50),
      name: "Whit Monday",
      note: "7th Monday after Easter",
    },
    {
      date: new Date(Date.UTC(year, 7, 1)),
      name: "Emancipation Day",
      note: "Marking the abolition of slavery in 1834",
    },
    {
      date: nthWeekdayOfMonth(year, 7, 1, 1),
      name: "Kadooment Day",
      note: "Climax of the Crop Over Festival",
    },
    {
      date: new Date(Date.UTC(year, 10, 30)),
      name: "Independence Day",
      note: "National Day",
    },
    { date: new Date(Date.UTC(year, 11, 25)), name: "Christmas Day" },
    { date: new Date(Date.UTC(year, 11, 26)), name: "Boxing Day" },
  ];

  const mondayInLieuNames = new Set([
    "New Year's Day",
    "Errol Barrow Day",
    "National Heroes Day",
    "Labour Day",
    "Independence Day",
    "Boxing Day",
  ]);

  const substitutes: Array<Holiday> = [];
  for (const h of fixed) {
    const dow = h.date.getUTCDay();

    if (mondayInLieuNames.has(h.name) && dow === 0) {
      substitutes.push({
        date: addDays(h.date, 1),
        name: `Public Holiday in lieu of ${h.name}`,
        substitute: true,
      });
    }

    if (h.name === "Emancipation Day" && (dow === 0 || dow === 1)) {
      substitutes.push({
        date: addDays(h.date, dow === 0 ? 2 : 1),
        name: "Public Holiday in lieu of Emancipation Day",
        substitute: true,
      });
    }

    if (h.name === "Christmas Day" && dow === 0) {
      substitutes.push({
        date: addDays(h.date, 2),
        name: "Public Holiday in lieu of Christmas Day",
        substitute: true,
      });
    }
  }

  return [...fixed, ...substitutes].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}
