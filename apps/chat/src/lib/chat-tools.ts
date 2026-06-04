import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const setFieldDef = toolDefinition({
  name: "set_field",
  description:
    "Record one form field value. fieldId MUST be an exact id from the FORM SCHEMA. Dates as ISO YYYY-MM-DD; select/radio/checkbox values must match an option's `value` exactly. Call every time you learn a value (even single words); multiple calls per turn are fine.",
  inputSchema: z.object({
    fieldId: z.string().meta({
      description: "Exact fieldId from the FORM SCHEMA system message.",
    }),
    value: z.string().meta({
      description:
        "Raw value. For dates use YYYY-MM-DD. For select/radio use the option value, not the label.",
    }),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
  }),
});

export const presentChoicesDef = toolDefinition({
  name: "present_choices",
  description:
    "Ask a closed-set question as clickable buttons (yes/no, certificate type, parent vs guardian, etc). Not for open answers like names, dates, or addresses. The question text goes ONLY in these args, never in your text reply. END YOUR TURN after calling.",
  inputSchema: z.object({
    question: z.string(),
    choices: z.array(z.string()).min(2),
  }),
  outputSchema: z.object({
    shown: z.boolean(),
  }),
});

export const submitFormDef = toolDefinition({
  name: "submit_form",
  description:
    "Submit the active form using values already recorded via set_field. Call ONCE, after every required field is recorded and you have written the review summary. The user gets an Approve/Deny prompt, so do not ask for confirmation in chat. Takes no arguments — reads from the active session.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    ok: z.boolean(),
    referenceNumber: z.string().optional(),
    errors: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
  needsApproval: true,
});
