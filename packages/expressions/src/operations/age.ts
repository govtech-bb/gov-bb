import { durationSince } from "./duration-since";

// Whole years since a date of birth (Barbados wall-clock, truncated). Thin
// delegate over the shared `durationSince` primitive so existing callers
// (apps/api, form_builder) are unchanged.
export function age(dob: unknown): number {
  return durationSince(dob, "years");
}
