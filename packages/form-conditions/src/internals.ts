import type {
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";
import type { StepScopedValues } from "./index";

type ConditionalBehaviour =
  | FieldConditionalOnBehaviour
  | StepConditionalOnBehaviour;

export function flattenStepValues(
  values: StepScopedValues,
): Record<string, unknown> {
  return Object.values(values).reduce<Record<string, unknown>>(
    (acc, stepValues) => ({ ...acc, ...stepValues }),
    {},
  );
}

function resolveTargetValue(
  behaviour: ConditionalBehaviour,
  values: StepScopedValues,
  flatValues: Record<string, unknown>,
): unknown {
  if (behaviour.targetStepId) {
    return values[behaviour.targetStepId]?.[behaviour.targetFieldId];
  }
  return flatValues[behaviour.targetFieldId];
}

export function evaluateCondition(
  behaviour: ConditionalBehaviour,
  values: StepScopedValues,
  flatValues: Record<string, unknown>,
): boolean {
  const target = resolveTargetValue(behaviour, values, flatValues);

  switch (behaviour.operator) {
    case "equal":
      return target === behaviour.value;
    case "notEqual":
      return target !== behaviour.value;
    case "in": {
      const list = behaviour.value as Array<string | number>;
      return Array.isArray(list) && list.includes(target as string | number);
    }
    case "exists":
      return target !== undefined && target !== null && target !== "";
    default:
      return false;
  }
}
