import type { ValidationConfig } from "@govtech-bb/form-types";

export type FieldErrors = Record<string, string[]>;

/**
 * A single field validation failure with both its stable reason `code` (the
 * rule type that failed, e.g. `required`/`pattern`, or a synthetic date code)
 * and the human-readable `message`. The `message` drives on-screen display;
 * the `code` is what analytics records so reasons group stably regardless of
 * wording.
 */
export interface FieldErrorEntry {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: FieldErrors;
}

export type StepScopedValues = Record<
  string,
  Record<string, unknown> | Array<Record<string, unknown>>
>;

export type RuleRunner = (
  value: unknown,
  config: ValidationConfig,
  allValues: StepScopedValues,
) => string | null;
