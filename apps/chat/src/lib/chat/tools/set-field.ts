import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { getFormDefinition } from "#/lib/forms/defs";
import { findField } from "#/lib/forms/fields";
import { validateValue } from "#/lib/forms/validate";
import { canonicalizeValue } from "#/lib/forms/coerce";

// Record + validate ONE answer for a form field. No server session — the
// validated {fieldId, value} IS the collection state, persisted as this tool's
// result part on the message; the model reads prior setField results to know
// what's collected and what's left. Validation uses the shared
// @govtech-bb/form-validation engine (same rules as the forms app), so the model
// never decides validity. On ok:false the model surfaces the error and re-asks.
// (Single-value/text for now: date/multi-value coercion + conditional reveal are
// not yet handled.)
export interface SetFieldResult {
  ok: boolean;
  fieldId: string;
  value?: string;
  errors?: string[];
}

export async function applySetField(
  formId: string,
  fieldId: string,
  value: string,
  getDef: typeof getFormDefinition = getFormDefinition,
): Promise<SetFieldResult> {
  const contract = await getDef(formId);
  if (!contract) return { ok: false, fieldId, errors: ["form is unavailable"] };
  const field = findField(contract, fieldId);
  if (!field)
    return { ok: false, fieldId, errors: [`unknown field: ${fieldId}`] };
  // Coerce + validate the raw answer (coerce.ts handles label→value, dates,
  // booleans), and STORE the canonical string (option value(s) / "true"|"false"
  // / raw) — that's what the model carries between turns and passes to submit.
  const { ok, errors } = validateValue(field, value);
  const canonical = canonicalizeValue(field, value);
  return ok
    ? { ok: true, fieldId, value: canonical }
    : { ok: false, fieldId, value: canonical, errors };
}

const setFieldToolDef = toolDefinition({
  name: "setField",
  description:
    "Record and validate ONE of the user's answers for a form field, after they answer it. Pass the formId, the fieldId (from getFormDefinition), and the user's value. Returns ok:false with errors when the value breaks a rule — tell the user what's wrong and ask again. The recorded answers are the collection state: read your prior setField results to track what's filled and what's still needed.",
  inputSchema: z.object({
    formId: z.string(),
    fieldId: z.string(),
    value: z.string(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    fieldId: z.string(),
    value: z.string().optional(),
    errors: z.array(z.string()).optional(),
  }),
});

export const setFieldTool = setFieldToolDef.server(
  ({ formId, fieldId, value }) => applySetField(formId, fieldId, value),
);
