import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { formMode, type ChatFormMode } from "#/lib/forms/policy";
import { getFormDefinition } from "#/lib/forms/defs";
import { extractFields, type AskableField } from "#/lib/forms/fields";

// The form-definition LOOKUP tool. The model calls it with a service's formId
// (which rides on retrieved sources) to learn whether the assistant can act on
// that form and how — collect inline or hand off the link — plus the form's
// title. It does NOT collect fields or submit; it's the decision point the
// later form steps build on. An unapproved or unavailable form returns
// `found: false`, so the model falls back to general guidance instead of
// offering something it can't honour.

export interface FormLookup {
  found: boolean;
  mode?: ChatFormMode;
  title?: string;
  requiresPayment?: boolean;
  /** The form's fields in order, so the model can collect them (collect mode). */
  fields?: AskableField[];
}

const getFormDefinitionToolDef = toolDefinition({
  name: "getFormDefinition",
  description:
    "Look up a Government of Barbados form by its formId (found on a retrieved source) before offering to help with it. Returns whether the assistant can act on the form and how: mode 'collect' (can be filled in chat) or 'handoff' (only a link), plus the form title. found:false means the form isn't available to the assistant — answer from general guidance and don't offer it.",
  inputSchema: z.object({
    formId: z
      .string()
      .describe("The service's formId, e.g. get-death-certificate"),
    values: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "Answers collected so far (fieldId→value). Pass these to reveal fields that only appear based on earlier answers; omit on the first lookup.",
      ),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    mode: z.enum(["collect", "handoff"]).optional(),
    title: z.string().optional(),
    requiresPayment: z.boolean().optional(),
    fields: z
      .array(
        z.object({
          fieldId: z.string(),
          label: z.string(),
          htmlType: z.string(),
          required: z.boolean(),
          hint: z.string().optional(),
          multiple: z.boolean().optional(),
          options: z
            .array(z.object({ label: z.string(), value: z.string() }))
            .optional(),
          step: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

// Pure lookup logic — `getDef` injectable so it's testable without the forms API
// or the tool-execution harness. `values` (answers so far) reveals conditional
// fields: with none, only the unconditional fields are returned.
export async function lookupForm(
  formId: string,
  values: Record<string, string> = {},
  getDef: typeof getFormDefinition = getFormDefinition,
): Promise<FormLookup> {
  const mode = formMode(formId);
  if (!mode) return { found: false }; // not chat-approved
  const contract = await getDef(formId);
  if (!contract) return { found: false }; // unavailable / failed to load
  return {
    found: true,
    mode,
    title: contract.title,
    requiresPayment: contract.requiresPayment ?? false,
    fields: extractFields(contract, values),
  };
}

export const getFormDefinitionTool = getFormDefinitionToolDef.server(
  ({ formId, values }) => lookupForm(formId, values ?? {}),
);
