import type {
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
  RepeatableBehaviour,
  ServiceContract,
} from "@govtech-bb/form-types";
import { evaluateCondition, flattenStepValues } from "./internals";

export type StepScopedValues = Record<
  string,
  Record<string, unknown> | Array<Record<string, unknown>>
>;

export interface ConditionResult {
  activeStepIds: Set<string>;
  hiddenStepIds: Set<string>;
  /** For repeatable steps, the instance-0 projection. Read
   * `activeFieldsByInstance` for per-instance data. */
  activeFieldIds: Map<string, Set<string>>;
  hiddenFieldIds: Map<string, Set<string>>;
  activeFieldsByInstance: Map<string, Array<Set<string>>>;
  hiddenFieldsByInstance: Map<string, Array<Set<string>>>;
}

function isRepeatable(
  step: ServiceContract["steps"][number],
): RepeatableBehaviour | undefined {
  return step.behaviours?.find(
    (b): b is RepeatableBehaviour => b.type === "repeatable",
  );
}

function getInstances(
  step: ServiceContract["steps"][number],
  values: StepScopedValues,
): Array<Record<string, unknown>> | null {
  const raw = values[step.stepId];
  if (raw === undefined) return null; // step not submitted — no instances
  if (Array.isArray(raw)) return raw.length > 0 ? raw : [];
  return [raw];
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
    activeFieldsByInstance: new Map(),
    hiddenFieldsByInstance: new Map(),
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

    const repeatable = isRepeatable(step);
    let instances: Array<Record<string, unknown>>;
    if (repeatable) {
      const got = getInstances(step, values);
      if (got === null) continue;
      instances = got;
    } else {
      instances = [(values[step.stepId] as Record<string, unknown>) ?? {}];
    }

    const activeByInstance: Array<Set<string>> = [];
    const hiddenByInstance: Array<Set<string>> = [];

    for (const instanceValues of instances) {
      const activeInStep = new Set<string>();
      const hiddenInStep = new Set<string>();

      for (const primitive of step.elements) {
        if (primitive.isHidden === true) {
          hiddenInStep.add(primitive.fieldId);
          continue;
        }
        const fieldConditions = (primitive.behaviours ?? []).filter(
          (b): b is FieldConditionalOnBehaviour =>
            b.type === "fieldConditionalOn",
        );
        const fieldActive =
          fieldConditions.length === 0 ||
          fieldConditions.every((b) =>
            evaluateCondition(b, values, flatValues, instanceValues),
          );
        if (fieldActive) activeInStep.add(primitive.fieldId);
        else hiddenInStep.add(primitive.fieldId);
      }

      activeByInstance.push(activeInStep);
      hiddenByInstance.push(hiddenInStep);
    }

    result.activeFieldsByInstance.set(step.stepId, activeByInstance);
    result.hiddenFieldsByInstance.set(step.stepId, hiddenByInstance);

    result.activeFieldIds.set(step.stepId, activeByInstance[0] ?? new Set());
    if (hiddenByInstance[0] && hiddenByInstance[0].size > 0) {
      result.hiddenFieldIds.set(step.stepId, hiddenByInstance[0]);
    }
  }

  return result;
}
