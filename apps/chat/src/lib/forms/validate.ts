import { validateField } from "@govtech-bb/form-validation";
import type { Primitive } from "@govtech-bb/form-types";
import { coerceValue } from "./coerce";

export interface FieldValidation {
  ok: boolean;
  errors: string[];
}

// Validate one field's RAW answer against its rules via the shared
// @govtech-bb/form-validation engine — so the chat enforces the exact same rules
// as the forms app (the model never decides validity). Coerces to the typed
// value first (coerce.ts). Cross-field rules (conditionalOn, which need the full
// value set) are handled later.
export function validateValue(field: Primitive, raw: string): FieldValidation {
  // Coerce the raw answer to the typed value first (date→parts, checkbox→bool,
  // option→value); a coercion failure is itself a validation error.
  const coerced = coerceValue(field, raw);
  if ("error" in coerced) return { ok: false, errors: [coerced.error] };
  // Third arg is the cross-step value set (for conditionalOn etc.); single-field
  // validation passes an empty set.
  const errors = validateField(field, coerced.value, {});
  return { ok: errors.length === 0, errors };
}
