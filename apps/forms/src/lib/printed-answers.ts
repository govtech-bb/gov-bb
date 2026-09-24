import type { StepScopedValues } from "@govtech-bb/form-conditions";
import {
  buildSubmissionSections,
  type SummarySection,
} from "@govtech-bb/submission-summary";
import type { FormMeta } from "@forms/types";
import { repeatStepConcactenator } from "./form-builder/helpers/repeatable-helper";

/**
 * The applicant's answers as labelled sections, for the printed confirmation
 * (#2587).
 *
 * Runs the same builder the MDA notification email and the case webhook run, so
 * the paper copy a citizen keeps reads exactly like the email the MDA received:
 * the same question text, the same order, the same dates, and nothing the
 * applicant was never asked.
 *
 * `visibleFieldIdsByStep` is the visible set the renderer has already evaluated
 * for the submission payload — reused rather than re-derived, so the printed
 * copy cannot disagree with what was sent.
 */
export function buildPrintedAnswers({
  formMeta,
  visibleFieldIdsByStep,
  values,
}: {
  formMeta: FormMeta;
  visibleFieldIdsByStep: Record<string, string[]>;
  values: Record<string, unknown>;
}): SummarySection[] {
  const activeFieldIds = foldRepeatInstances(visibleFieldIdsByStep);

  return buildSubmissionSections({
    // The client keeps a step's fields under `fields`; the shared builder reads
    // `elements`, as the service contract names them.
    contract: {
      steps: formMeta.contractSteps.map((step) => ({
        ...step,
        elements: step.fields,
      })),
    },
    values: values as StepScopedValues,
    visibility: {
      activeStepIds: Object.keys(activeFieldIds),
      hiddenStepIds: [],
      activeFieldIds,
      hiddenFieldIds: {},
    },
  });
}

/**
 * Collapse a repeatable step's instance pages back onto the step they came
 * from.
 *
 * `setupRepeatSteps` splits a repeatable across `<stepId>` and `<stepId>~1…~N`,
 * so the renderer evaluates each page's visible fields under its own key —
 * and for a `sharedFields` step the base page holds only the shared fields.
 * The submitted values go the other way, collapsing every instance back under
 * the base `stepId`. Left unfolded, the two disagree and every per-instance
 * answer is filtered out of the printed copy as one the applicant was never
 * asked for.
 *
 * Taking the union across instances is what the API's own audit trail records
 * for a repeatable step, and it cannot over-report: an answer a given instance
 * does not hold has no value, so its row is dropped anyway.
 */
function foldRepeatInstances(
  visibleFieldIdsByStep: Record<string, string[]>,
): Record<string, string[]> {
  const folded: Record<string, string[]> = {};
  for (const [stepId, fieldIds] of Object.entries(visibleFieldIdsByStep)) {
    const baseStepId = stepId.split(repeatStepConcactenator)[0];
    folded[baseStepId] = [
      ...new Set([...(folded[baseStepId] ?? []), ...fieldIds]),
    ];
  }
  return folded;
}
