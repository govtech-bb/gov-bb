import type { ValidationConfig } from "@govtech-bb/form-types";
import type { StepScopedValues } from "../types";

const MISSING = Symbol("MISSING");

export function resolveReference(
  config: ValidationConfig,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown> = {},
): unknown | typeof MISSING {
  const { referenceFieldId, targetStepId } = config;
  if (referenceFieldId === undefined) return MISSING;

  if (targetStepId !== undefined) {
    const target = allValues[targetStepId];
    if (target !== undefined && referenceFieldId in target)
      return target[referenceFieldId];
    // targetStepId not in allValues yet — fall back to stepValues
    if (referenceFieldId in stepValues) return stepValues[referenceFieldId];
    return MISSING;
  }

  // Flat fallback — scan all saved steps, then the current step's values
  for (const saved of Object.values(allValues)) {
    if (referenceFieldId in saved) return saved[referenceFieldId];
  }
  if (referenceFieldId in stepValues) return stepValues[referenceFieldId];

  return MISSING;
}

export { MISSING };
