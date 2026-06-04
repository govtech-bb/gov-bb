import { DateValueInput, FieldValue } from "@govtech-bb/form-types";

// Field rule-checking now lives in `@govtech-bb/form-validation` (the single
// source of truth, also used by `apps/api`); `validation-builder` calls it via
// `validate`. Conditional evaluation now lives in `@govtech-bb/form-conditions`
// (also used by `apps/api`); `behavior-helper`/`validation-builder` call its
// `evaluateCondition` (#668). The helpers below are the pieces that are *not*
// rule checks and are still consumed elsewhere:
//  - `valueIsEmpty` — emptiness semantics shared with the validation boundary
//    and `apps/forms/src/lib/api/forms.ts`.
//  - `isDateComplete` — the date-object emptiness check behind `valueIsEmpty`.
//  - `RequiredState` — the required/visibility state enum returned by
//    `helpers/behavior-helper.ts`.

export type RequiredState =
  | "requiredAndEmpty"
  | "notRequiredAndEmpty"
  | "notRequired"
  | "notEmpty"
  | "unknownState";

export const valueIsEmpty = (value: FieldValue): boolean | undefined => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string")
    return value.length === 0; // If required and no content, flag it.
  else if (Array.isArray(value)) {
    return value.length === 0; // I want this to check each element for truthiness
  } else if (typeof value === "boolean")
    return !value; // It's a boolean. If it's required then it must be true
  else if (typeof value === "number") return value.toString().length === 0;
  else if ("day" in value || "month" in value || "year" in value) {
    // Checking for DateValueInput
    return !isDateComplete(value); // need to negate
  } else {
    return undefined;
  }
};

/**
 * Parse a raw date-part input string (day/month/year) into a number for
 * storage in the field's DateValueInput.
 *
 * Strips non-digit characters and returns `undefined` for empty input, so the
 * value is never `NaN` (which would render as the literal "NaN" in the field)
 * and never a stray `0` from `Number("")`. Coercion happens here on input only
 * to keep the stored shape numeric; date *validation* still runs on submit.
 */
export const parseDatePart = (raw: string): number | undefined => {
  const digits = raw.replace(/\D/g, "");
  return digits === "" ? undefined : Number(digits);
};

export const isDateComplete = (value: DateValueInput): boolean => {
  return (
    value.day !== undefined &&
    value.month !== undefined &&
    value.year !== undefined
  );
};
