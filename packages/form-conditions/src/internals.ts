import type {
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";
import type { StepScopedValues } from "./index";

type ConditionalBehaviour =
  | FieldConditionalOnBehaviour
  | StepConditionalOnBehaviour;

/**
 * Merge non-repeatable step values into a flat lookup. Repeatable-step
 * arrays are skipped so their numeric keys and per-instance fieldId
 * collisions don't pollute the map; fields inside repeatable steps are
 * resolved via the instance-scoped lookup in `resolveTargetValue`.
 */
export function flattenStepValues(
  values: StepScopedValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const stepValue of Object.values(values)) {
    if (Array.isArray(stepValue)) continue;
    Object.assign(out, stepValue);
  }
  return out;
}

function resolveTargetValue(
  behaviour: ConditionalBehaviour,
  values: StepScopedValues,
  flatValues: Record<string, unknown>,
  instanceLocal?: Record<string, unknown>,
): unknown {
  if (
    behaviour.targetStepId === undefined &&
    instanceLocal !== undefined &&
    behaviour.targetFieldId in instanceLocal
  ) {
    return instanceLocal[behaviour.targetFieldId];
  }
  if (behaviour.targetStepId) {
    const target = values[behaviour.targetStepId];
    if (Array.isArray(target)) {
      return target[0]?.[behaviour.targetFieldId];
    }
    return target?.[behaviour.targetFieldId];
  }
  return flatValues[behaviour.targetFieldId];
}

export function evaluateCondition(
  behaviour: ConditionalBehaviour,
  values: StepScopedValues,
  flatValues: Record<string, unknown>,
  instanceLocal?: Record<string, unknown>,
): boolean {
  const target = resolveTargetValue(
    behaviour,
    values,
    flatValues,
    instanceLocal,
  );

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
