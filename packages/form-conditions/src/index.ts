import type {
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
  ServiceContract,
} from "@govtech-bb/form-types";
import { evaluateCondition, flattenStepValues } from "./internals";

export type StepScopedValues = Record<string, Record<string, unknown>>;

export interface ConditionResult {
  activeStepIds: Set<string>;
  hiddenStepIds: Set<string>;
  activeFieldIds: Map<string, Set<string>>; // stepId → Set<fieldId>
  hiddenFieldIds: Map<string, Set<string>>; // stepId → Set<fieldId>
}

export function evaluateFormConditions(
  contract: ServiceContract,
  values: StepScopedValues,
): ConditionResult {
  const flatValues = flattenStepValues(values);

  const result: ConditionResult = {
    activeStepIds: new Set(),
    hiddenStepIds: new Set(),
    activeFieldIds: new Map(),
    hiddenFieldIds: new Map(),
  };

  for (const step of contract.steps) {
    const stepConditions = (step.behaviours ?? []).filter(
      (b): b is StepConditionalOnBehaviour => b.type === "stepConditionalOn",
    );

    const stepActive =
      stepConditions.length === 0 ||
      stepConditions.every((b) => evaluateCondition(b, values, flatValues));

    if (!stepActive) {
      result.hiddenStepIds.add(step.stepId);
      const hidden = new Set(step.elements.map((p) => p.fieldId));
      result.hiddenFieldIds.set(step.stepId, hidden);
      continue;
    }

    result.activeStepIds.add(step.stepId);

    const activeInStep = new Set<string>();
    const hiddenInStep = new Set<string>();

    for (const primitive of step.elements) {
      const fieldConditions = (primitive.behaviours ?? []).filter(
        (b): b is FieldConditionalOnBehaviour =>
          b.type === "fieldConditionalOn",
      );

      const fieldActive =
        fieldConditions.length === 0 ||
        fieldConditions.every((b) => evaluateCondition(b, values, flatValues));

      if (fieldActive) {
        activeInStep.add(primitive.fieldId);
      } else {
        hiddenInStep.add(primitive.fieldId);
      }
    }

    result.activeFieldIds.set(step.stepId, activeInStep);
    if (hiddenInStep.size > 0) {
      result.hiddenFieldIds.set(step.stepId, hiddenInStep);
    }
  }

  return result;
}
