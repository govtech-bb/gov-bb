import type { FormStep, Primitive } from "@govtech-bb/form-types";
import {
  isCompleteDateValue,
  formatDateValue,
} from "@govtech-bb/form-validation";
import {
  resolveFieldLabel,
  resolveStepTitle,
  type StepScopedValues,
} from "@govtech-bb/form-conditions";
import { isOptionField, resolveOptionDisplay } from "./field-display";

export { isOptionField, resolveOptionDisplay } from "./field-display";

/** One answered question: the contract's field id, the label the applicant was
 * asked under, and the answer rendered for a human. */
export interface SummaryField {
  fieldId: string;
  label: string;
  /** Formatted for display for every field type EXCEPT `file`, which stays the
   * raw array of upload nodes so each surface can render them its own way —
   * the email joins filenames, the CMS merges signed URLs and shows
   * thumbnails. */
  value: unknown;
}

/** One step's worth of answers, in contract order. */
export interface SummarySection {
  stepId: string;
  title: string;
  fields: SummaryField[];
}

/**
 * Which steps and fields the applicant actually saw, as recorded on the
 * submission audit trail.
 *
 * `activeFieldIds` / `hiddenFieldIds` hold `string[][]` for repeatable steps —
 * one entry per instance (V2 audit trails, PR #156) — and `string[]` otherwise.
 * A step with no entry at all means "show every field": a new audit-trail
 * schema must never silently blank an existing form's answers.
 */
export interface SubmissionVisibility {
  activeStepIds: string[];
  hiddenStepIds: string[];
  activeFieldIds: Record<string, string[] | string[][]>;
  hiddenFieldIds: Record<string, string[] | string[][]>;
}

/** The part of a service contract this builder reads. Declared structurally so
 * both the API's full `ServiceContract` and the trimmed contract the forms
 * client holds satisfy it. */
export interface SummaryContract {
  steps: FormStep[];
}

// Elements that carry no answer — guidance copy and reveal wrappers.
const SKIP_TYPES = new Set<Primitive["htmlType"]>(["show-hide", "content"]);

/**
 * Render a submission as ordered, labelled sections: the single source of truth
 * behind the MDA notification email, the mapped case webhook payload and the
 * printed confirmation.
 *
 * Ordering, section titles and field labels come from the contract — never from
 * the submitted values — so a question the applicant skipped through a branch
 * is absent rather than blank, and every surface reads in the order the form
 * was filled in.
 */
export function buildSubmissionSections({
  contract,
  values,
  visibility,
}: {
  contract: SummaryContract;
  values: StepScopedValues;
  visibility: SubmissionVisibility;
}): SummarySection[] {
  return contract.steps
    .filter((step) => visibility.activeStepIds.includes(step.stepId))
    .filter((step) => !visibility.hiddenStepIds.includes(step.stepId))
    .flatMap((step) => {
      const rawVal = values[step.stepId];

      // Resolve any per-answer title override (#871) against the submitted
      // values, so the section header matches the heading the applicant saw
      // while filling in the form. Falls back to the static title for steps
      // without a `conditionalTitle`.
      const stepTitle = resolveStepTitle(step, values);

      if (Array.isArray(rawVal)) {
        // Repeatable step (V2 submission values) — one section per instance.
        // Number titles only when there is more than one instance so that a
        // single-instance repeatable reads identically to a normal step.
        const needsIndex = rawVal.length > 1;
        return rawVal
          .map((instance, i) =>
            buildSection(
              step,
              instance as Record<string, unknown>,
              visibility,
              values,
              needsIndex ? `${stepTitle} (${i + 1})` : stepTitle,
            ),
          )
          .filter((s) => s.fields.length > 0);
      }

      const section = buildSection(
        step,
        (rawVal as Record<string, unknown>) ?? {},
        visibility,
        values,
        stepTitle,
      );
      return section.fields.length > 0 ? [section] : [];
    });
}

function buildSection(
  step: FormStep,
  stepValues: Record<string, unknown>,
  visibility: SubmissionVisibility,
  allValues: StepScopedValues,
  title: string,
): SummarySection {
  const rawActive: unknown = visibility.activeFieldIds[step.stepId];
  const activeFieldIds: string[] | undefined =
    rawActive === undefined ? undefined : flattenIds(rawActive);

  const rawHidden: unknown = visibility.hiddenFieldIds[step.stepId];
  const hiddenFieldIds: string[] =
    rawHidden === undefined ? [] : flattenIds(rawHidden);

  const fields = step.elements
    .filter((el) => !SKIP_TYPES.has(el.htmlType))
    // `ui.hidden` fields are machine-written and were never shown to the
    // applicant — in production that is the geocoded routing coordinate. They
    // carry data the CMS payload needs, but printing
    // "Address coordinates: 13.09,-59.57" shows the citizen and the polyclinic
    // a row neither asked for and neither can act on. check-your-answers
    // already filters them the same way (review.tsx).
    .filter((el) => !el.ui?.hidden)
    .filter((el) =>
      activeFieldIds === undefined ? true : activeFieldIds.includes(el.fieldId),
    )
    .filter((el) => !hiddenFieldIds.includes(el.fieldId))
    .map((el) => ({
      fieldId: el.fieldId,
      // Resolve any per-answer label override (#2521) the same way the step
      // title is resolved above, so each answer is named exactly as the
      // applicant was asked for it.
      label: resolveFieldLabel(el, allValues),
      value: formatValue(el, stepValues[el.fieldId]),
    }))
    .filter((f) => f.value !== "");

  return { stepId: step.stepId, title, fields };
}

/**
 * Normalise an audit-trail entry to a flat list of field ids. V2 trails store
 * per-instance arrays as `string[][]` for repeatable steps; a plain `string[]`
 * (V1) passes through. Flattening to a union means `.includes()` works whatever
 * the schema version.
 */
function flattenIds(value: unknown): string[] {
  return Array.isArray(value) && value.length > 0 && Array.isArray(value[0])
    ? [...new Set((value as string[][]).flat())]
    : (value as string[]);
}

/** `""` means "no answer" — the caller drops the row, and a section left with
 * no rows at all. */
function formatValue(field: Primitive, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return "";

  // Option fields (radio/select/checkbox/checkbox-accordion) resolve value
  // slugs to labels via the shared helper (#842), then render as a
  // comma-joined string.
  if (isOptionField(field)) {
    const display = resolveOptionDisplay(field, raw);
    return Array.isArray(display) ? display.join(", ") : String(display);
  }

  switch (field.htmlType) {
    case "file": {
      // Stored answer is an array of { key, name, size, type } upload items.
      // Mirror FilesService.collectFileEntries: only items with a non-empty
      // string `key` were durably uploaded. The surviving nodes are handed on
      // as-is; "" when none survive, so the row is omitted.
      if (!Array.isArray(raw)) return "";
      const uploaded = (raw as Array<Record<string, unknown>>).filter(
        (item) => typeof item?.key === "string" && item.key.length > 0,
      );
      return uploaded.length > 0 ? uploaded : "";
    }

    case "date": {
      if (isCompleteDateValue(raw)) return formatDateValue(raw);
      // Legacy submissions stored ISO strings — pass them through. Any
      // other shape (partial/malformed object) would stringify to
      // "[object Object]", so omit the row instead.
      return typeof raw === "string" ? raw : "";
    }

    default:
      // Multi-value string answers (fieldArray, opening-hours entries) join
      // like every other list — ", ", not the bare comma String() would
      // produce.
      return Array.isArray(raw) ? raw.map(String).join(", ") : String(raw);
  }
}
