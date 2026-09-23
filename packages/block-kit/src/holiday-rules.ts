/**
 * The seeded rule rows for the `bank-holiday-rules` collection.
 *
 * These are DATA — in the running spike they live in `collection_records`
 * and an author edits them. They are declared here so `holidays.test.ts`
 * can pin them against the original generator; `packages/spike-db` imports
 * this array as its seed rather than keeping a second copy.
 *
 * All 12 statutory holidays of the First Schedule, Cap. 352. The six-row
 * sample in the build brief is not the full list.
 */

import type { HolidayRuleRecord } from "./holidays";

export const BANK_HOLIDAY_RULES: HolidayRuleRecord[] = [
  {
    key: "new-years-day",
    name: "New Year's Day",
    rule: { kind: "fixed", month: 1, day: 1 },
    substitution: "sunday_to_monday",
  },
  {
    key: "errol-barrow-day",
    name: "Errol Barrow Day",
    note: "Honouring the first Prime Minister of Barbados",
    rule: { kind: "fixed", month: 1, day: 21 },
    substitution: "sunday_to_monday",
  },
  {
    key: "good-friday",
    name: "Good Friday",
    rule: { kind: "easter_offset", days: -2 },
  },
  {
    key: "easter-monday",
    name: "Easter Monday",
    rule: { kind: "easter_offset", days: 1 },
  },
  {
    key: "national-heroes-day",
    name: "National Heroes Day",
    note: "Honouring Barbados's ten official National Heroes",
    rule: { kind: "fixed", month: 4, day: 28 },
    substitution: "sunday_to_monday",
  },
  {
    key: "labour-day",
    name: "Labour Day",
    note: "International Workers' Day",
    rule: { kind: "fixed", month: 5, day: 1 },
    substitution: "sunday_to_monday",
  },
  {
    key: "whit-monday",
    name: "Whit Monday",
    note: "7th Monday after Easter",
    rule: { kind: "easter_offset", days: 50 },
  },
  {
    key: "emancipation-day",
    name: "Emancipation Day",
    note: "Marking the abolition of slavery in 1834",
    rule: { kind: "fixed", month: 8, day: 1 },
    substitution: "sunday_or_monday_to_tuesday",
  },
  {
    key: "kadooment-day",
    name: "Kadooment Day",
    note: "Climax of the Crop Over Festival",
    rule: { kind: "nth_weekday", month: 8, weekday: 1, n: 1 },
  },
  {
    key: "independence-day",
    name: "Independence Day",
    note: "National Day",
    rule: { kind: "fixed", month: 11, day: 30 },
    substitution: "sunday_to_monday",
  },
  {
    key: "christmas-day",
    name: "Christmas Day",
    rule: { kind: "fixed", month: 12, day: 25 },
    substitution: "sunday_to_tuesday",
  },
  {
    key: "boxing-day",
    name: "Boxing Day",
    rule: { kind: "fixed", month: 12, day: 26 },
    substitution: "sunday_to_monday",
  },
];
