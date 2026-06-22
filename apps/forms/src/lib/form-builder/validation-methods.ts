// Field rule-checking now lives in `@govtech-bb/form-validation` (the single
// source of truth, also used by `apps/api`); `validation-builder` calls it via
// `validate`. Conditional evaluation now lives in `@govtech-bb/form-conditions`
// (also used by `apps/api`); `behavior-helper`/`validation-builder` call its
// `evaluateCondition` (#668). Emptiness semantics (`valueIsEmpty`,
// `isDateComplete`) now live in `@govtech-bb/form-types` so the submission
// reshaper shares them (#1398) — re-exported here for the existing consumers.
// The pieces still defined locally are not rule checks:
//  - `RequiredState` — the required/visibility state enum returned by
//    `helpers/behavior-helper.ts`.
//  - `parseDatePart` — raw date-part input parsing for the field renderer.

export { valueIsEmpty, isDateComplete } from "@govtech-bb/form-types";

export type RequiredState =
  | "requiredAndEmpty"
  | "notRequiredAndEmpty"
  | "notRequired"
  | "notEmpty"
  | "unknownState";

/**
 * Parse a raw date-part input string (day/month/year) into the digit-string
 * stored in the field's DateValueInput.
 *
 * Strips non-digit characters and returns `undefined` for empty input (so the
 * emptiness/completeness checks still fire). The value stays a string — `"09"`
 * is preserved verbatim rather than collapsing to `9`, and `"00"` stays
 * distinct from `"0"` — following the GOV.UK guidance of treating date parts as
 * text (#815). Numbers are derived only at the validation/formatting boundary
 * in `@govtech-bb/form-validation`, which tolerates both shapes (ADR 0043).
 */
export const parseDatePart = (raw: string): string | undefined => {
  const digits = raw.replace(/\D/g, "");
  return digits === "" ? undefined : digits;
};
