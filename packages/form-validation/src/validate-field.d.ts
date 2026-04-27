import type { Primitive } from "@govtech-bb/form-types";
import type { StepScopedValues } from "./types";
export declare function validateField(
  field: Primitive,
  value: unknown,
  allValues: StepScopedValues,
  stepValues?: Record<string, unknown>,
): string[];
