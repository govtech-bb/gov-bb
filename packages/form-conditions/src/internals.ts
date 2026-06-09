import type {
  DurationTransform,
  FieldConditionalOnBehaviour,
  OptionalIfBehaviour,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";
import { durationSince } from "@govtech-bb/expressions";
import type { StepScopedValues } from "./index";

// Map the conditional `transform` keyword to the unit `durationSince` expects.
const TRANSFORM_UNIT: Record<DurationTransform, "years" | "months" | "days"> = {
  yearsSince: "years",
  monthsSince: "months",
  daysSince: "days",
};

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
  const rawTarget = resolveTargetValue(
    behaviour,
    values,
    flatValues,
    instanceLocal,
  );

  // When a `transform` is set, derive a number from the (date) target before
  // any operator runs — e.g. `yearsSince` turns a DOB into a whole-year age.
  // Invalid/empty dates become NaN here, which the numeric operators below
  // reject (NaN never matches), so a missing date reads as condition-not-met.
  const target = behaviour.transform
    ? durationSince(rawTarget, TRANSFORM_UNIT[behaviour.transform])
    : rawTarget;

  // Coerce both sides to string so a numeric condition value (e.g. value: 5)
  // matches the string a number input returns from form state (e.g. "5").
  const coerce = (v: unknown): string => String(v ?? "");

  // Numeric comparison helper for gte/lte/gt/lt: both sides to Number, and a
  // NaN on either side never matches.
  const compareNumeric = (cmp: (a: number, b: number) => boolean): boolean => {
    const a = Number(target);
    const b = Number(behaviour.value);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return cmp(a, b);
  };

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
    case "gte":
      return compareNumeric((a, b) => a >= b);
    case "lte":
      return compareNumeric((a, b) => a <= b);
    case "gt":
      return compareNumeric((a, b) => a > b);
    case "lt":
      return compareNumeric((a, b) => a < b);
    default:
      return false;
  }
}
