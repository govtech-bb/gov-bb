import type { Primitive } from "@govtech-bb/form-types";
import type { FieldErrors, ValidationResult, StepScopedValues } from "./types";
import { validateField } from "./validate-field";

export interface ValidateOptions {
  primitives: Primitive[];
  stepValues: Record<string, unknown>;
  allValues?: StepScopedValues;
}

export function validateFields({
  primitives,
  stepValues,
  allValues = {},
}: ValidateOptions): ValidationResult {
  const errors: FieldErrors = {};

  for (const field of primitives) {
    const value = stepValues[field.fieldId];
    const fieldErrors = validateField(field, value, allValues, stepValues);
    if (fieldErrors.length > 0) {
      errors[field.fieldId] = fieldErrors;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
