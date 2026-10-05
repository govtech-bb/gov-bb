import type { FormStep, Primitive } from "@govtech-bb/form-types";

/** One answered question: the contract's field id, the label the applicant was
 * asked under, and the answer rendered for a human. */
export interface SummaryField {
  fieldId: string;
  label: string;
  /** Formatted for display for every field type EXCEPT `file`, which stays the
   * raw array of upload nodes so each surface can render them its own way —
   * the email and the printed page name them (see `summaryValueToText`), the
   * CMS merges signed URLs and shows thumbnails. */
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

/** What the renderer needs of a field. Widened from `Primitive` — a
 * discriminated union the forms client's `ClientPrimitive` does not belong to
 * — so both callers pass their own field type without a cast. */
export type SummaryElement = Pick<Primitive, "fieldId" | "label" | "options"> &
  Partial<Pick<Primitive, "groups" | "ui" | "conditionalLabel">> & {
    htmlType: Primitive["htmlType"];
  };

export type SummaryStep = Pick<
  FormStep,
  "stepId" | "title" | "conditionalTitle"
> & {
  elements: SummaryElement[];
};

/** The part of a service contract this builder reads. Declared structurally so
 * both the API's full `ServiceContract` and the trimmed contract the forms
 * client holds satisfy it — the client's step keeps its fields under
 * `elements` for this call. */
export interface SummaryContract {
  steps: SummaryStep[];
}
