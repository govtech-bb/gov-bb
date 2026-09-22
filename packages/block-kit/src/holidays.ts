/**
 * The rule engine: editable rows in, computed dates out.
 *
 * This is the data/code seam the spike is testing. A `HolidayRuleRecord` is
 * a row an author can edit; every function below is code they cannot.
 *
 * `substitution` is per-rule rather than one policy for the whole calendar
 * because the Public Holidays Act, Cap. 352 has three distinct substitution
 * rules at the foot of the First Schedule — see the findings write-up.
 */

import { addDays, easterSunday, nthWeekdayOfMonth } from "./dates";

export type HolidayRule =
  /** `month` is 1-based, as it is in the seeded JSON. */
  | { kind: "fixed"; month: number; day: number }
  | { kind: "easter_offset"; days: number }
  | { kind: "nth_weekday"; month: number; weekday: number; n: number };

export type SubstitutionRule =
  | "none"
  /** Cap. 352 (a): falls on a Sunday → the next Monday. */
  | "sunday_to_monday"
  /** Cap. 352 (b): falls on a Sunday or a Monday → the next Tuesday. */
  | "sunday_or_monday_to_tuesday"
  /** Cap. 352 (c): falls on a Sunday → the next Tuesday. */
  | "sunday_to_tuesday";

export interface HolidayRuleRecord {
  key: string;
  name: string;
  note?: string;
  rule: HolidayRule;
  substitution?: SubstitutionRule;
}

export interface Holiday {
  date: Date;
  name: string;
  note?: string;
  /** True when this row is a "Monday/Tuesday in lieu" substitution. */
  substitute?: boolean;
}

/** The policy selected on the calendar block. */
export type SubstitutionPolicy = "none" | "next-working-day" | "cap-352";

export function resolveRule(rule: HolidayRule, year: number): Date {
  switch (rule.kind) {
    case "fixed":
      return new Date(Date.UTC(year, rule.month - 1, rule.day));
    case "easter_offset":
      return addDays(easterSunday(year), rule.days);
    case "nth_weekday":
      return nthWeekdayOfMonth(year, rule.month - 1, rule.weekday, rule.n);
  }
}

/** The substitute day a single rule generates, or null for none. */
function substituteFor(
  record: HolidayRuleRecord,
  date: Date,
  policy: SubstitutionPolicy,
): Holiday | null {
  if (policy === "none") return null;

  const dow = date.getUTCDay();

  if (policy === "next-working-day") {
    // A deliberately naive alternative, so switching the policy in the
    // editor visibly changes the rendered calendar.
    if (dow !== 0 && dow !== 6) return null;
    return {
      date: addDays(date, dow === 0 ? 1 : 2),
      name: `Public Holiday in lieu of ${record.name}`,
      substitute: true,
    };
  }

  switch (record.substitution ?? "none") {
    case "sunday_to_monday":
      return dow === 0
        ? {
            date: addDays(date, 1),
            name: `Public Holiday in lieu of ${record.name}`,
            substitute: true,
          }
        : null;
    case "sunday_or_monday_to_tuesday":
      return dow === 0 || dow === 1
        ? {
            date: addDays(date, dow === 0 ? 2 : 1),
            name: `Public Holiday in lieu of ${record.name}`,
            substitute: true,
          }
        : null;
    case "sunday_to_tuesday":
      return dow === 0
        ? {
            date: addDays(date, 2),
            name: `Public Holiday in lieu of ${record.name}`,
            substitute: true,
          }
        : null;
    case "none":
      return null;
  }
}

export function holidaysForYear(
  records: HolidayRuleRecord[],
  year: number,
  policy: SubstitutionPolicy = "cap-352",
): Holiday[] {
  const primary: Holiday[] = records.map((record) => {
    const date = resolveRule(record.rule, year);
    return record.note
      ? { date, name: record.name, note: record.note }
      : { date, name: record.name };
  });

  const substitutes: Holiday[] = [];
  records.forEach((record, index) => {
    const substitute = substituteFor(record, primary[index].date, policy);
    if (substitute) substitutes.push(substitute);
  });

  return [...primary, ...substitutes].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

export function holidaysForRange(
  records: HolidayRuleRecord[],
  min: number,
  max: number,
  policy: SubstitutionPolicy = "cap-352",
): Holiday[] {
  const out: Holiday[] = [];
  for (let year = min; year <= max; year++) {
    out.push(...holidaysForYear(records, year, policy));
  }
  return out;
}
