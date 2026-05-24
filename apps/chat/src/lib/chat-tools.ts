import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const setFieldDef = toolDefinition({
  name: "set_field",
  description:
    "Record a single form field value collected from the user. Call this every time you learn a field's value — names, dates, addresses, choices, etc. The fieldId MUST be one of the exact ids in the FORM SCHEMA system message. Date values should be ISO YYYY-MM-DD. Select/radio/checkbox values must match an option's `value` exactly. Multiple set_field calls per turn are fine.",
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
    "Show the user a multiple-choice question with clickable buttons. Use this when the user's next answer falls into a small closed set (yes/no, type of certificate, parent vs guardian, etc). Do NOT use for open-ended answers like names, dates, or addresses. The UI renders the question and buttons from the tool args — do NOT also type the question as plain text in the same turn. After this tool call, END YOUR TURN.",
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
    "Submit the active form to the official API using values already recorded via set_field. Call ONCE after every required field is recorded AND you have written a review summary. The user will see an Approve/Deny prompt before the submission actually runs; you do not need to ask for confirmation in chat. Takes no arguments — reads from the active session.",
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
