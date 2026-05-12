import type { StepInstance } from "./submission-expand";
import type { SubmissionValues } from "./submissions.types";

export interface NormalizeInput {
  instances: StepInstance[];
  hiddenStepIds: Set<string>;
  activeFieldsByInstance: Map<string, Array<Set<string>>>;
}

function filterToActive(
  values: Record<string, unknown>,
  active: Set<string> | undefined,
): Record<string, unknown> {
  if (!active) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (active.has(k)) out[k] = v;
  }
  return out;
}

export function normalizeForStorage(input: NormalizeInput): SubmissionValues {
  const { instances, hiddenStepIds, activeFieldsByInstance } = input;
  const out: SubmissionValues = {};

  const byStep = new Map<string, StepInstance[]>();
  for (const inst of instances) {
    if (hiddenStepIds.has(inst.stepId)) continue;
    const list = byStep.get(inst.stepId) ?? [];
    list.push(inst);
    byStep.set(inst.stepId, list);
  }

  for (const [stepId, stepInstances] of byStep) {
    const sorted = stepInstances.slice().sort((a, b) => a.index - b.index);
    const activeArr = activeFieldsByInstance.get(stepId) ?? [];

    if (sorted[0]?.isRepeatable) {
      out[stepId] = sorted.map((inst) =>
        filterToActive(inst.values, activeArr[inst.index]),
      );
    } else {
      const inst = sorted[0]!;
      out[stepId] = filterToActive(inst.values, activeArr[0]);
    }
  }

  return out;
}
