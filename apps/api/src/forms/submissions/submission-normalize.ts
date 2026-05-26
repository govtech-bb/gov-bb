import type { StepInstance } from "./submission-expand";
import type { SubmissionValues } from "./submissions.types";

export interface NormalizeInput {
  instances: StepInstance[];
  hiddenStepIds: Set<string>;
  activeFieldsByInstance: Map<string, Array<Set<string>>>;
  // For each step, the field ids whose values are file-attachment arrays.
  // Their array entries have transient presigned `url` fields stripped
  // before persistence (only the S3 `key` is durable).
  fileFieldsByStep?: Map<string, Set<string>>;
}

function stripFileEntryUrl(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const { url: _url, ...rest } = item as Record<string, unknown>;
  return rest;
}

function projectFileField(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(stripFileEntryUrl);
}

function filterToActive(
  values: Record<string, unknown>,
  active: Set<string> | undefined,
  fileFields: Set<string> | undefined,
): Record<string, unknown> {
  if (!active) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!active.has(k)) continue;
    out[k] = fileFields?.has(k) ? projectFileField(v) : v;
  }
  return out;
}

export function normalizeForStorage(input: NormalizeInput): SubmissionValues {
  const { instances, hiddenStepIds, activeFieldsByInstance, fileFieldsByStep } =
    input;
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
    const fileFields = fileFieldsByStep?.get(stepId);

    if (sorted[0]?.isRepeatable) {
      out[stepId] = sorted.map((inst) =>
        filterToActive(inst.values, activeArr[inst.index], fileFields),
      );
    } else {
      const inst = sorted[0]!;
      out[stepId] = filterToActive(inst.values, activeArr[0], fileFields);
    }
  }

  return out;
}
