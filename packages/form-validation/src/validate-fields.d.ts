import type { Primitive } from "@govtech-bb/form-types";
import type { ValidationResult, StepScopedValues } from "./types";
export interface ValidateOptions {
  primitives: Primitive[];
  stepValues: Record<string, unknown>;
  allValues?: StepScopedValues;
}
export declare function validateFields({
  primitives,
  stepValues,
  allValues,
}: ValidateOptions): ValidationResult;
