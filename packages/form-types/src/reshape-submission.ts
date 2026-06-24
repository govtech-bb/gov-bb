import { FieldValue } from "./validation.type";
import { SubmissionValues } from "./submission.type";
import { valueIsEmpty } from "./value-empty";

/** A collected value with its resolved step and field, ready to bucket. */
export interface StepFieldEntry {
  stepId: string;
  fieldId: string;
  value: unknown;
}

/**
 * A collected value belongs in the submission unless it's empty. `false` is a
 * real answer (an unchecked optional checkbox) and must survive — valueIsEmpty
 * treats it as empty for required-field validation, so the carve-out lives here.
 */
export function isSubmittableValue(value: unknown): boolean {
  if (value === undefined) return false;
  if (value === false) return true;
  return !valueIsEmpty(value as FieldValue);
}

/**
 * Bucket resolved (stepId, fieldId, value) entries into the step-keyed
 * `SubmissionValues` wire shape — `{ [stepId]: { [fieldId]: value } }` —
 * dropping non-submittable (empty) values. Last write wins for a repeated
 * (stepId, fieldId).
 *
 * This is the keying + empty-filtering core shared by the forms UI
 * (formatDataForSubmission) and the chat assistant (reshapeByStep) so both
 * build POST /submissions identically (#1398). Repeatable-step collapsing into
 * arrays is NOT done here — it depends on browser form state and stays in
 * apps/forms.
 */
export function assembleStepKeyedValues(
  entries: Iterable<StepFieldEntry>,
): SubmissionValues {
  const out: SubmissionValues = {};
  for (const { stepId, fieldId, value } of entries) {
    if (!isSubmittableValue(value)) continue;
    const bucket = (out[stepId] ??= {}) as Record<string, unknown>;
    bucket[fieldId] = value;
  }
  return out;
}
