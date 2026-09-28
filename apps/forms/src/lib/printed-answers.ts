import type { StepScopedValues } from "@govtech-bb/form-conditions";
import {
  buildSubmissionSections,
  summaryValueToText,
  type SummarySection,
} from "@govtech-bb/submission-summary";
import type { FormMeta, RepeatableStepSettings } from "@forms/types";

import { repeatStepConcactenator } from "./form-builder/helpers/repeatable-helper";

/**
 * The applicant's answers as labelled sections, for the printed confirmation
 * (#2587).
 *
 * Runs the same builder the MDA notification email and the case webhook run,
 * so the paper copy a citizen keeps reads like the email the MDA received: the
 * same question text, the same order, the same dates, and — for a question the
 * applicant was shown — the same answer. It does skip the email's
 * `SUPPRESSED_STEPS` and its appended "Higher-risk assessment" section; those
 * are built separately from the stored submission, not from this function.
 *
 * `visibleFieldIdsByStep` is the visible set the renderer has already evaluated
 * for the submission payload — reused rather than re-derived, so the printed
 * copy cannot disagree with what was sent.
 */
export function buildPrintedAnswers({
  formMeta,
  visibleFieldIdsByStep,
  values,
  repeatSettings,
}: {
  formMeta: FormMeta;
  visibleFieldIdsByStep: Record<string, string[]>;
  values: Record<string, unknown>;
  repeatSettings: RepeatableStepSettings;
}): SummarySection[] {
  const activeFieldIds = foldRepeatInstances(visibleFieldIdsByStep);

  const sections = buildSubmissionSections({
    // The client keeps a step's fields under `fields`; the shared builder reads
    // `elements`, as the service contract names them.
    contract: {
      steps: formMeta.contractSteps.map((step) => ({
        ...step,
        elements: step.fields,
      })),
    },
    values: pruneHiddenRepeatAnswers(
      values,
      visibleFieldIdsByStep,
      repeatSettings,
    ) as StepScopedValues,
    visibility: {
      activeStepIds: Object.keys(activeFieldIds),
      hiddenStepIds: [],
      activeFieldIds,
      hiddenFieldIds: {},
    },
  });

  // A `file` answer comes back as the raw upload nodes (see `SummaryField`),
  // which carry each document's durable S3 key — the email and CMS name them
  // at their own render time, but this builder's output is persisted (see
  // `SubmissionState.sections`), so naming it here keeps the key out of
  // storage. `summaryValueToText` is a no-op on the already-formatted string
  // every other field type carries.
  return sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => ({
      ...field,
      value: summaryValueToText(field.value),
    })),
  }));
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
 * for a repeatable step. It CAN over-report, though: the shared builder applies
 * this one union to every instance alike, so an answer hidden on instance A but
 * shown on instance B would print on A too — `pruneHiddenRepeatAnswers` below
 * removes it from A's own values first, so the union's leniency never reaches
 * an instance that doesn't hold that answer.
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

/**
 * Prune each repeat instance's values to the field ids visible on that
 * instance's own page, mirroring the API's `normalizeForStorage`
 * (`filterToActive`).
 *
 * Without this, an answer hidden on one instance but shown on another survives
 * in `values[stepId][i]`: `formatDataForSubmission` only deletes a hidden
 * field from the flat form values, never from `repeatSettings.stepData`, so
 * the instance object handed in here still carries it. The shared builder
 * then can't tell — `foldRepeatInstances` above unions every instance's
 * visible ids under the base step id, and `buildSubmissionSections` applies
 * that one union to every instance alike.
 *
 * `orderedStepIds` gives the instance pages in submission order:
 * `formatDataForSubmission` builds `values[stepId][i]` from
 * `orderedStepIds[i]` directly for an ordinary repeatable (the base step is
 * instance 1), or from `orderedStepIds[i + 1]` for a `sharedFields` repeatable
 * (the base step is a separate shared-values page, not an instance — its own
 * fields are shared by every instance instead).
 */
function pruneHiddenRepeatAnswers(
  values: Record<string, unknown>,
  visibleFieldIdsByStep: Record<string, string[]>,
  repeatSettings: RepeatableStepSettings,
): Record<string, unknown> {
  const pruned: Record<string, unknown> = { ...values };

  for (const [stepId, config] of Object.entries(repeatSettings)) {
    const instances = values[stepId];
    if (!Array.isArray(instances)) continue;

    const hasSharedFields = Object.keys(config.sharedData ?? {}).length > 0;
    const instanceStepIds = hasSharedFields
      ? config.orderedStepIds.slice(1)
      : config.orderedStepIds;
    const sharedFieldIds = hasSharedFields
      ? (visibleFieldIdsByStep[stepId] ?? [])
      : [];

    pruned[stepId] = instances.map((instance, i) => {
      const visibleForInstance = visibleFieldIdsByStep[instanceStepIds[i]];
      // No recorded visibility for this instance (shouldn't happen for a
      // submitted one) — leave it untouched rather than dropping real answers.
      if (!visibleForInstance) return instance;

      const visible = new Set([...visibleForInstance, ...sharedFieldIds]);
      return Object.fromEntries(
        Object.entries(instance as Record<string, unknown>).filter(
          ([fieldId]) => visible.has(fieldId),
        ),
      );
    });
  }

  return pruned;
}
