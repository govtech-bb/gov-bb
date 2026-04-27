import type {
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";
import type { StepScopedValues } from "./index";
type ConditionalBehaviour =
  | FieldConditionalOnBehaviour
  | StepConditionalOnBehaviour;
export declare function flattenStepValues(
  values: StepScopedValues,
): Record<string, unknown>;
export declare function evaluateCondition(
  behaviour: ConditionalBehaviour,
  values: StepScopedValues,
  flatValues: Record<string, unknown>,
): boolean;
export {};
