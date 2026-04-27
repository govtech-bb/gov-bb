import type { ServiceContract } from "@govtech-bb/form-types";
export type StepScopedValues = Record<string, Record<string, unknown>>;
export interface ConditionResult {
  activeStepIds: Set<string>;
  hiddenStepIds: Set<string>;
  activeFieldIds: Map<string, Set<string>>;
  hiddenFieldIds: Map<string, Set<string>>;
}
export declare function evaluateFormConditions(
  contract: ServiceContract,
  values: StepScopedValues,
): ConditionResult;
