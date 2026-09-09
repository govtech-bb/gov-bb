import { DateValueInput, FieldValue } from "./validation.type";

// Emptiness semantics for a collected field value. Shared across the validation
// boundary, the forms UI, and the submission reshaper (see reshape-submission).
// Moved here from apps/forms so both the browser form and the chat assistant
// judge emptiness identically (#1398).

/** True when every entry of `value` is a blank (or whitespace-only) string —
 * the shape a fieldArray leaves behind when rows were added but never typed
 * into. Such an array carries no answer, so `required` must reject it and the
 * submission reshaper must drop it; ADR 0069 noted this gap ("required
 * remains weak on an array") and this closes it. An array holding anything
 * that is not a string (file objects, option slugs) is never all-blank. */
export const isAllBlankStringArray = (value: readonly unknown[]): boolean =>
  value.every(
    (entry) => typeof entry === "string" && entry.trim().length === 0,
  );

export const valueIsEmpty = (value: FieldValue): boolean | undefined => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string")
    return value.length === 0; // If required and no content, flag it.
  else if (Array.isArray(value)) {
    // Empty, or nothing but blank strings — either way, no answer.
    return value.length === 0 || isAllBlankStringArray(value);
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

export const isDateComplete = (value: DateValueInput): boolean => {
  // A part is present only when it is non-empty — agrees with
  // isCompleteDateValue at the validation boundary, which rejects "" (#815).
  const isFilled = (part: string | number | undefined): boolean =>
    part !== undefined && part !== "";
  return isFilled(value.day) && isFilled(value.month) && isFilled(value.year);
};
