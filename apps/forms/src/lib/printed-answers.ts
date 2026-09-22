import type { StepScopedValues } from "@govtech-bb/form-conditions";
import {
  buildSubmissionSections,
  type SummarySection,
} from "@govtech-bb/submission-summary";
import type { ClientFormStep } from "@forms/types";

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
  steps,
  visibleFieldIdsByStep,
  values,
}: {
  steps: ClientFormStep[];
  visibleFieldIdsByStep: Record<string, string[]>;
  values: Record<string, unknown>;
}): SummarySection[] {
  return buildSubmissionSections({
    // The client keeps a step's fields under `fields`; the shared builder reads
    // `elements`, as the service contract names them.
    contract: {
      steps: steps.map((step) => ({ ...step, elements: step.fields })),
    },
    values: values as StepScopedValues,
    visibility: {
      activeStepIds: Object.keys(visibleFieldIdsByStep),
      hiddenStepIds: [],
      activeFieldIds: visibleFieldIdsByStep,
      hiddenFieldIds: {},
    },
  });
}
