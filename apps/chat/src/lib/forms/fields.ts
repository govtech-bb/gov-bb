import type { Primitive, ServiceContract } from "@govtech-bb/form-types";
import { activeFieldIds } from "./conditions";
import { isAutoConfirmedField } from "./auto-confirm";

// The collection foundation: flatten a deployed ServiceContract into the ordered
// list of fields the chat should ask for, GIVEN the answers so far (`values`).
// Conditional fields only appear once their trigger is set — so call again with
// accumulated answers to reveal them. Walks steps → elements in document order;
// skips hidden fields and show-hide disclosure toggles (UI affordances, not
// questions). `required` is the presence of a `required` rule. Escape-toggle
// pairing is deferred. (No values → only the unconditional fields are active.)
export interface AskableField {
  fieldId: string;
  label: string;
  htmlType: string;
  required: boolean;
  hint?: string;
  multiple?: boolean;
  options?: { label: string; value: string }[];
  /** The step (page) this field belongs to, for grouping. */
  step?: string;
}

// The raw Primitive for a fieldId (validation needs the full field, not the
// AskableField projection). Walks steps → elements; undefined if not found.
export function findField(
  contract: ServiceContract,
  fieldId: string,
): Primitive | undefined {
  for (const step of contract.steps) {
    for (const el of step.elements) {
      if (el.fieldId === fieldId) return el;
    }
  }
  return undefined;
}

export function extractFields(
  contract: ServiceContract,
  values: Record<string, string> = {},
): AskableField[] {
  const active = activeFieldIds(contract, values);
  const fields: AskableField[] = [];
  for (const step of contract.steps) {
    for (const el of step.elements) {
      if (el.isHidden || el.htmlType === "show-hide") continue;
      // Auto-confirmed (the feedback declaration) — the chat confirms it for the
      // user, so the model is never told to ask it (seeded at submit instead).
      if (isAutoConfirmedField(contract, el.fieldId)) continue;
      if (!active.has(el.fieldId)) continue; // conditional, not yet revealed
      fields.push({
        fieldId: el.fieldId,
        label: el.label,
        htmlType: el.htmlType,
        required: Boolean(el.validations?.required),
        ...(el.hint ? { hint: el.hint } : {}),
        ...(el.multiple ? { multiple: true } : {}),
        ...(el.options
          ? {
              options: el.options.map((o) => ({
                label: o.label,
                value: o.value,
              })),
            }
          : {}),
        ...(step.title ? { step: step.title } : {}),
      });
    }
  }
  return fields;
}
