import type {
  ServiceContract,
  RepeatableBehaviour,
} from "@govtech-bb/form-types";
import type { SubmissionValues } from "./submissions.types";

export const MAX_INSTANCES_HARD = 500;

export interface StepInstance {
  stepId: string;
  index: number;
  isRepeatable: boolean;
  values: Record<string, unknown>;
}

export type ShapeErrorReason =
  | "unknown_step"
  | "expected_object_got_array"
  | "expected_array_got_object"
  | "unknown_field"
  | "null_instance"
  | "too_many_instances"
  | "non_object_instance";

export interface ShapeError {
  stepId: string;
  index?: number;
  reason: ShapeErrorReason;
  message: string;
  detail?: { fieldId?: string; limit?: number; received?: number };
}

export interface ExpandedSubmission {
  byStep: Map<string, StepInstance[]>;
  instances: StepInstance[];
  shapeErrors: ShapeError[];
}

export interface ExpandOptions {
  /** When set, a single object submitted for a repeatable step is coerced
   * to a one-element array — tolerates drafts saved before the step was
   * marked repeatable. */
  draftId?: string;
}

function getRepeatable(
  step: ServiceContract["steps"][number],
): RepeatableBehaviour | undefined {
  return step.behaviours?.find(
    (b): b is RepeatableBehaviour => b.type === "repeatable",
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function expandSubmission(
  contract: ServiceContract,
  values: SubmissionValues,
  options: ExpandOptions = {},
): ExpandedSubmission {
  const byStep = new Map<string, StepInstance[]>();
  const instances: StepInstance[] = [];
  const shapeErrors: ShapeError[] = [];

  const knownStepIds = new Set(contract.steps.map((s) => s.stepId));

  for (const stepId of Object.keys(values)) {
    if (!knownStepIds.has(stepId)) {
      shapeErrors.push({
        stepId,
        reason: "unknown_step",
        message: `Unknown step '${stepId}'`,
      });
    }
  }

  for (const step of contract.steps) {
    const raw = values[step.stepId];
    if (raw === undefined) continue;

    const repeatable = getRepeatable(step);
    const knownFieldIds = new Set(step.elements.map((e) => e.fieldId));
    const stepInstances: StepInstance[] = [];

    if (repeatable) {
      let arr: Array<Record<string, unknown>>;

      if (Array.isArray(raw)) {
        arr = raw;
      } else if (isPlainObject(raw) && options.draftId !== undefined) {
        arr = [raw];
      } else if (isPlainObject(raw)) {
        shapeErrors.push({
          stepId: step.stepId,
          reason: "expected_array_got_object",
          message: `Step '${step.stepId}' is repeatable; values must be an array of instance objects`,
        });
        continue;
      } else {
        shapeErrors.push({
          stepId: step.stepId,
          reason: "non_object_instance",
          message: `Step '${step.stepId}' values must be an array`,
        });
        continue;
      }

      const limit = Math.min(repeatable.max, MAX_INSTANCES_HARD);
      if (arr.length > limit) {
        shapeErrors.push({
          stepId: step.stepId,
          reason: "too_many_instances",
          message: `Step '${step.stepId}' exceeds max instances (${arr.length} > ${limit})`,
          detail: { limit, received: arr.length },
        });
        continue;
      }

      for (let i = 0; i < arr.length; i++) {
        const inst = arr[i];
        if (inst === null) {
          shapeErrors.push({
            stepId: step.stepId,
            index: i,
            reason: "null_instance",
            message: `Step '${step.stepId}' instance ${i} is null`,
          });
          continue;
        }
        if (!isPlainObject(inst)) {
          shapeErrors.push({
            stepId: step.stepId,
            index: i,
            reason: "non_object_instance",
            message: `Step '${step.stepId}' instance ${i} is not an object`,
          });
          continue;
        }
        for (const fieldId of Object.keys(inst)) {
          if (!knownFieldIds.has(fieldId)) {
            shapeErrors.push({
              stepId: step.stepId,
              index: i,
              reason: "unknown_field",
              message: `Unknown field '${fieldId}' in step '${step.stepId}' instance ${i}`,
              detail: { fieldId },
            });
          }
        }
        const si: StepInstance = {
          stepId: step.stepId,
          index: i,
          isRepeatable: true,
          values: inst,
        };
        stepInstances.push(si);
        instances.push(si);
      }
    } else {
      if (Array.isArray(raw)) {
        shapeErrors.push({
          stepId: step.stepId,
          reason: "expected_object_got_array",
          message: `Step '${step.stepId}' is not repeatable; values must be an object`,
        });
        continue;
      }
      if (!isPlainObject(raw)) {
        shapeErrors.push({
          stepId: step.stepId,
          reason: "non_object_instance",
          message: `Step '${step.stepId}' values must be an object`,
        });
        continue;
      }
      for (const fieldId of Object.keys(raw)) {
        if (!knownFieldIds.has(fieldId)) {
          shapeErrors.push({
            stepId: step.stepId,
            reason: "unknown_field",
            message: `Unknown field '${fieldId}' in step '${step.stepId}'`,
            detail: { fieldId },
          });
        }
      }
      const si: StepInstance = {
        stepId: step.stepId,
        index: 0,
        isRepeatable: false,
        values: raw,
      };
      stepInstances.push(si);
      instances.push(si);
    }

    if (stepInstances.length > 0) {
      byStep.set(step.stepId, stepInstances);
    }
  }

  return { byStep, instances, shapeErrors };
}
