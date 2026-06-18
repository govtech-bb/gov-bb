import type { Primitive, ServiceContract } from "@govtech-bb/form-types";

// Steps the chat silently confirms on the user's behalf — formId → stepId.
//
// Scoped to the chat-feedback form ONLY. A real government form's declaration is
// legally load-bearing and must always be confirmed by the user. The feedback
// form has no business asking for a declaration ceremony, but the form-builder
// always regenerates a required declaration step on republish, so we can't keep
// it out of the recipe — we adapt around it in the chat pipeline instead:
// never ask for it, never show it in the Check-your-answers card, but DO send it
// upstream (the forms API still requires it). (ADR 0049, ported as the WHAT.)
const AUTO_CONFIRMED_STEPS: ReadonlyMap<string, string> = new Map([
  ["chat-feedback", "declaration"],
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

// Is this field one the chat confirms for the user, so every field-surfacing
// path (the askable list, presentField) must skip it? Keyed by the contract's
// formId — auto-confirm is per form, never global.
export function isAutoConfirmedField(
  contract: ServiceContract,
  fieldId: string,
): boolean {
  for (const field of autoConfirmedFields(contract)) {
    if (field.fieldId === fieldId) return true;
  }
  return false;
}

// The raw value that satisfies an auto-confirmed field's required rule. The
// declaration is components/confirmation — a checkbox with a single option
// { value: "confirmed" } — and coerce.ts routes an option checkbox through
// coerceList, which expects the option VALUE(s). A bare boolean checkbox takes
// "true". Derived from the field's options so it stays correct if the recipe's
// confirmation option ever changes.
function autoConfirmValue(field: Primitive): string {
  if (field.options?.length) return field.options.map((o) => o.value).join(",");
  return "true";
}

// Seed any auto-confirmed fields not already set, IN PLACE. Call on a COPY of
// the collected values at the submission boundary, so the confirmed declaration
// reaches the forms API without ever entering the values the model collected —
// keeping it out of the approval card and the model's "already collected" view
// for free (both omit fields with no value).
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
