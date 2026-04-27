import type { ValidationConfig } from "@govtech-bb/form-types";
export type FieldErrors = Record<string, string[]>;
export interface ValidationResult {
  valid: boolean;
  errors: FieldErrors;
}
export type StepScopedValues = Record<string, Record<string, unknown>>;
export type RuleRunner = (
  value: unknown,
  config: ValidationConfig,
  allValues: StepScopedValues,
) => string | null;
