import type { Primitive, ServiceContract } from "@govtech-bb/form-types";
import { findEscapeToggle, sectionForField } from "./schema";

// The canonical ask_field "field" payload the client renders a widget from:
// label, input type, option pills, the escape-hatch alternative, and a section
// header when the field opens a new step. Built purely from the CONTRACT +
// current values so the model never authors labels or options.
//
// Shared by ask_field (the tool the model calls) AND the deterministic
// re-present stream (run-turn re-renders this when a form is re-invoked with a
// required question still unanswered), so a re-rendered question is the exact
// same widget the model-driven path produces.
export interface AskFieldSpec {
  fieldId: string;
  label: string;
  htmlType: string;
  hint?: string;
  multiple?: boolean;
  options?: { label: string; value: string }[];
  validations?: Record<string, unknown>;
  alternative?: { fieldId: string; label: string; hint?: string };
  section?: string;
}

export function buildFieldSpec(
  contract: ServiceContract,
  field: Primitive,
  values: Record<string, unknown>,
  asked: ReadonlySet<string>,
): AskFieldSpec {
  // sectionForField skips `field` itself, so it doesn't matter whether the
  // caller has already added `field` to `asked`.
  const section = sectionForField(contract, field.fieldId, asked);
  // A show-hide toggle has no options in the contract (it's a disclosure click
  // in the forms UI). Synthesize Yes/No so the client renders the standard
  // choice pills — no bespoke widget needed.
  const options =
    field.htmlType === "show-hide"
      ? [
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
        ]
      : field.options?.map((o) => ({ label: o.label, value: o.value }));
  // Forms-UI parity for escape toggles: the toggle renders under its target
  // field's input as an either/or affordance, not as a separate question.
  const escape = findEscapeToggle(contract, field);
  const alternative =
    escape && values[escape.fieldId] !== "true"
      ? {
          fieldId: escape.fieldId,
          label: escape.label,
          hint: escape.hint ?? undefined,
        }
      : undefined;
  return {
    fieldId: field.fieldId,
    label: field.label,
    htmlType: field.htmlType,
    hint: field.hint ?? undefined,
    multiple: field.multiple ?? undefined,
    options,
    validations: field.validations ?? undefined,
    alternative,
    section: section ?? undefined,
  };
}
