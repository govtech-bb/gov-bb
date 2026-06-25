import { DateValueInput, FieldValue } from "./validation.type";

// Emptiness semantics for a collected field value. Shared across the validation
// boundary, the forms UI, and the submission reshaper (see reshape-submission).
// Moved here from apps/forms so both the browser form and the chat assistant
// judge emptiness identically (#1398).

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

export const isDateComplete = (value: DateValueInput): boolean => {
  // A part is present only when it is non-empty — agrees with
  // isCompleteDateValue at the validation boundary, which rejects "" (#815).
  const isFilled = (part: string | number | undefined): boolean =>
    part !== undefined && part !== "";
  return isFilled(value.day) && isFilled(value.month) && isFilled(value.year);
};
