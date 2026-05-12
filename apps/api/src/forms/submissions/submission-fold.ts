import type { StepInstance } from "./submission-expand";
import type {
  FieldErrorMap,
  StepErrorBundle,
  ValidationErrorBundle,
} from "./submissions.types";

export type PerInstanceErrors = Map<string, FieldErrorMap>;
export type StepLevelErrors = Map<string, string[]>;

export interface FoldInput {
  instances: StepInstance[];
  perInstanceErrors: PerInstanceErrors;
  stepLevelErrors: StepLevelErrors;
}

function instanceKey(stepId: string, index: number): string {
  return `${stepId}:${index}`;
}

function hasAnyError(map: FieldErrorMap): boolean {
  return Object.keys(map).length > 0;
}

export function foldErrors(input: FoldInput): ValidationErrorBundle {
  const { instances, perInstanceErrors, stepLevelErrors } = input;

  const byStep = new Map<string, StepInstance[]>();
  for (const inst of instances) {
    const list = byStep.get(inst.stepId) ?? [];
    list.push(inst);
    byStep.set(inst.stepId, list);
  }

  const bundle: ValidationErrorBundle = {};

  const allStepIds = new Set<string>([
    ...stepLevelErrors.keys(),
    ...byStep.keys(),
  ]);

  for (const stepId of allStepIds) {
    const stepInstances = (byStep.get(stepId) ?? [])
      .slice()
      .sort((a, b) => a.index - b.index);
    const stepErrs = stepLevelErrors.get(stepId);
    const isRepeatable = stepInstances.some((i) => i.isRepeatable);

    if (!isRepeatable && stepInstances.length > 0) {
      const inst = stepInstances[0];
      const fieldErrs = perInstanceErrors.get(instanceKey(stepId, inst.index));
      if (fieldErrs && hasAnyError(fieldErrs)) {
        bundle[stepId] = fieldErrs;
      }
      if (stepErrs && stepErrs.length > 0) {
        bundle[stepId] = {
          ...((bundle[stepId] as FieldErrorMap | undefined) ?? {}),
          _step: stepErrs,
        } as unknown as StepErrorBundle;
      }
      continue;
    }

    const instanceMaps: FieldErrorMap[] = stepInstances.map(
      (inst) => perInstanceErrors.get(instanceKey(stepId, inst.index)) ?? {},
    );

    const anyInstanceHasErr = instanceMaps.some(hasAnyError);
    const hasStepErr = stepErrs && stepErrs.length > 0;

    if (!anyInstanceHasErr && !hasStepErr) continue;

    bundle[stepId] = {
      ...(hasStepErr ? { _step: stepErrs } : {}),
      instances: instanceMaps,
    };
  }

  return bundle;
}
