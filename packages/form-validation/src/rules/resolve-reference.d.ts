import type { ValidationConfig } from "@govtech-bb/form-types";
import type { StepScopedValues } from "../types";
declare const MISSING: unique symbol;
export declare function resolveReference(
  config: ValidationConfig,
  allValues: StepScopedValues,
  stepValues?: Record<string, unknown>,
): unknown | typeof MISSING;
export { MISSING };
