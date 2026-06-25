import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { getFormDefinition } from "#/lib/forms/defs";
import { findField } from "#/lib/forms/fields";
import { isAutoConfirmedField } from "#/lib/forms/auto-confirm";

// Present ONE field's input widget to the user. The model calls this to ask a
// field; the client renders its tool-call part as the right widget (option
// pills for choices, a labelled prompt otherwise) — rendering a tool call as a
// UI component. The spec comes from the CONTRACT (never the model), so
// labels/options can't be hallucinated. The user answers via the widget (a pill
// click / typed text → a normal user message), then the model calls setField to
// validate + record it.
export interface PresentedField {
  found: boolean;
  fieldId: string;
  label?: string;
  htmlType?: string;
  required?: boolean;
  multiple?: boolean;
  hint?: string;
  options?: { label: string; value: string }[];
}

export async function presentField(
  formId: string,
  fieldId: string,
  getDef: typeof getFormDefinition = getFormDefinition,
): Promise<PresentedField> {
  const contract = await getDef(formId);
  const field = contract ? findField(contract, fieldId) : undefined;
  if (!field) return { found: false, fieldId };
  // The chat confirms auto-confirmed fields (the feedback declaration) itself —
  // never surface them, even if the model asks by explicit fieldId.
  if (contract && isAutoConfirmedField(contract, fieldId)) {
    return { found: false, fieldId };
  }
  return {
    found: true,
    fieldId,
    label: field.label,
    htmlType: field.htmlType,
    required: Boolean(field.validations?.required),
    ...(field.multiple ? { multiple: true } : {}),
    ...(field.hint ? { hint: field.hint } : {}),
    ...(field.options
      ? {
          options: field.options.map((o) => ({
            label: o.label,
            value: o.value,
          })),
        }
      : {}),
  };
}

const presentFieldToolDef = toolDefinition({
  name: "presentField",
  description:
    "Show the user the input for ONE form field — its label, hint, and (for choices) clickable option pills. Call this to ASK a field; the widget shows the question, so do not also type it out. Pass the formId and fieldId. After the user answers, call setField to validate and record it. Ask one field at a time, in order.",
  inputSchema: z.object({ formId: z.string(), fieldId: z.string() }),
  outputSchema: z.object({
    found: z.boolean(),
    fieldId: z.string(),
    multiple: z.boolean().optional(),
    label: z.string().optional(),
    htmlType: z.string().optional(),
    required: z.boolean().optional(),
    hint: z.string().optional(),
    options: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .optional(),
  }),
});

export const presentFieldTool = presentFieldToolDef.server(
  ({ formId, fieldId }) => presentField(formId, fieldId),
);
