import type { ValidationConfig } from "@govtech-bb/form-types";
import type { StepScopedValues } from "../types";

const MISSING = Symbol("MISSING");

export function resolveReference(
  config: ValidationConfig,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown> = {},
): unknown | typeof MISSING {
  const { reference, targetStepId } = config;
  if (reference === undefined) return MISSING;

  if (targetStepId !== undefined) {
    const target = allValues[targetStepId];
    if (target !== undefined && reference in target) return target[reference];
    // targetStepId not in allValues yet — fall back to stepValues
    if (reference in stepValues) return stepValues[reference];
    return MISSING;
  }

  // Flat fallback — scan all saved steps, then the current step's values
  for (const saved of Object.values(allValues)) {
    if (reference in saved) return saved[reference];
  }
  if (reference in stepValues) return stepValues[reference];

  return MISSING;
}

export { MISSING };
