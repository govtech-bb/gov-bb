import type {
  FieldConditionalOnBehaviour,
  OptionalIfBehaviour,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";
import type { StepScopedValues } from "./index";

type ConditionalBehaviour =
  | FieldConditionalOnBehaviour
  | OptionalIfBehaviour
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

  // Coerce both sides to string so a numeric condition value (e.g. value: 5)
  // matches the string a number input returns from form state (e.g. "5").
  const coerce = (v: unknown): string => String(v ?? "");

  switch (behaviour.operator) {
    case "equal":
      return coerce(target) === coerce(behaviour.value);
    case "notEqual":
      return coerce(target) !== coerce(behaviour.value);
    case "in": {
      const list = behaviour.value as Array<string | number>;
      return Array.isArray(list) && list.map(coerce).includes(coerce(target));
    }
    case "exists":
      if (target === undefined || target === null || target === "")
        return false;
      if (Array.isArray(target) && target.length === 0) return false;
      return true;
    default:
      return false;
  }
}
