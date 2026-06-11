import type { Primitive, ServiceContract } from "@govtech-bb/form-types";
import { FEEDBACK_FORM_ID } from "#/lib/chat/feedback";

// Steps the chat silently confirms on the user's behalf — keyed by formId →
// stepId.
//
// The in-chat chat-feedback form reuses the generic conversational form
// pipeline, so it inherits whatever the recipe carries. #1114 removed its
// "declaration" step (a permit-style ceremony, wrong on a 30-second feedback
// form), but the recipe is republished through the form-builder, which ALWAYS
// regenerates a required declaration step — v1.4.0 and v1.5.0 brought it back
// (apps/api/.../recipes/chat-feedback/). We can't keep it out of the recipe,
// so we handle it in chat: never ask for it, never show it in the
// check-your-answers summary, but DO send it upstream (the forms API still
// requires it). Scoped to the feedback form ONLY — a real government form's
// declaration is legally load-bearing and must always be confirmed by the user.
const AUTO_CONFIRMED_STEPS: ReadonlyMap<string, string> = new Map([
  [FEEDBACK_FORM_ID, "declaration"],
]);

// Every element in a form's auto-confirmed step (none for forms with no entry).
function* autoConfirmedFields(contract: ServiceContract): Generator<Primitive> {
  const stepId = AUTO_CONFIRMED_STEPS.get(contract.formId);
  if (!stepId) return;
  for (const step of contract.steps) {
    if (step.stepId !== stepId) continue;
    for (const el of step.elements) yield el;
  }
}

// Is this field one the chat confirms for the user (so the disclosure and ask
// cursor must skip it)? Reads the contract's formId — auto-confirm is scoped
// per form, never global.
export function isAutoConfirmedField(
  contract: ServiceContract,
  fieldId: string,
): boolean {
  for (const field of autoConfirmedFields(contract)) {
    if (field.fieldId === fieldId) return true;
  }
  return false;
}

// The raw value that satisfies an auto-confirmed field's "required" rule. The
// declaration uses components/confirmation — a checkbox with a single option
// { value: "confirmed" } — and the forms app stores the option value(s), which
// our submit coercer (coerceList) expects. A bare boolean checkbox (no options)
// takes "true". Either way the value rides through coerceToSteps and validates.
function autoConfirmValue(field: Primitive): string {
  if ("options" in field && field.options?.length) {
    return field.options.map((o) => o.value).join(",");
  }
  return "true";
}

// Fill any auto-confirmed fields the user hasn't already set, in place. Called
// at the submission boundary (submit.ts) so the confirmed declaration reaches
// the forms API without ever entering session.values — keeping it out of the
// review summary and the model's "already collected" view for free.
export function applyAutoConfirmedValues(
  contract: ServiceContract,
  values: Record<string, string>,
): void {
  for (const field of autoConfirmedFields(contract)) {
    const existing = values[field.fieldId];
    if (existing === undefined || existing === "") {
      values[field.fieldId] = autoConfirmValue(field);
    }
  }
}
