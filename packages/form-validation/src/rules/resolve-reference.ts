import type { ValidationConfig } from "@govtech-bb/form-types";
import type { StepScopedValues } from "../types";

const MISSING = Symbol("MISSING");

// Takes just the reference pair, so a `scaleBy` (#3636) resolves through the
// same lookup as a rule's own reference.
export function resolveReference(
  config: Pick<ValidationConfig, "referenceFieldId" | "targetStepId">,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown> = {},
): unknown | typeof MISSING {
  const { referenceFieldId, targetStepId } = config;
  if (referenceFieldId === undefined) return MISSING;

  if (targetStepId !== undefined) {
    const target = allValues[targetStepId];
    if (target === undefined) {
      if (referenceFieldId in stepValues) return stepValues[referenceFieldId];
      return MISSING;
    }
    if (Array.isArray(target)) {
      const inst = target[0];
      if (inst && referenceFieldId in inst) return inst[referenceFieldId];
      return MISSING;
    }
    if (referenceFieldId in target) return target[referenceFieldId];
    if (referenceFieldId in stepValues) return stepValues[referenceFieldId];
    return MISSING;
  }

  if (referenceFieldId in stepValues) return stepValues[referenceFieldId];

  let resolved: unknown = MISSING;
  for (const saved of Object.values(allValues)) {
    if (Array.isArray(saved)) continue;
    if (referenceFieldId in saved) resolved = saved[referenceFieldId];
  }
  return resolved;
}

export { MISSING };
