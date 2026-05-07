import type { ValidationConfig } from "@govtech-bb/form-types";

export type FieldErrors = Record<string, string[]>;

export interface ValidationResult {
  valid: boolean;
  errors: FieldErrors;
}

// StepScopedValues mirrors the shape from @govtech-bb/form-conditions
export type StepScopedValues = Record<string, Record<string, unknown>>;

// Cross-field rules resolve via config.targetStepId + config.referenceFieldId.
// Falls back to flat scan across all steps if targetStepId is absent.
// If the referenced field cannot be found, the rule is skipped (no error).
export type RuleRunner = (
  value: unknown, // TODO, Update this and tests to use FieldValue type.
  config: ValidationConfig,
  allValues: StepScopedValues,
) => string | null; // null = passes, string = error message
