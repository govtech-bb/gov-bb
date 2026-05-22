import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const submitFormDef = toolDefinition({
  name: "submit_form",
  description:
    "Submit the official service form on the user's behalf using the answers collected in chat. Call it ONLY after EVERY required field is collected AND the user has explicitly confirmed the summary (e.g. 'yes, submit', 'looks good'). On success the tool returns a reference number — quote it back to the user verbatim. On failure the tool returns validation errors; apologise, ask the user to correct, and retry. Do NOT claim the form was submitted unless this tool returns ok:true with a referenceNumber.",
  inputSchema: z.object({
    service: z.string().meta({
      description:
        "The form slug. MUST be one of the slugs listed in the system prompt as available this turn.",
    }),
    serviceTitle: z.string().meta({
      description: "Human-readable service name to show in the handoff UI.",
    }),
    fields: z.record(z.string(), z.string()).meta({
      description:
        "All collected field values keyed by the exact fieldId from the FORM SCHEMA system message. Dates should be ISO YYYY-MM-DD; option values must match the schema's [option|option] enum exactly.",
    }),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    referenceNumber: z.string().optional().meta({
      description:
        "The submission reference returned by the forms API on success. Quote it back to the user.",
    }),
    errors: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
        }),
      )
      .optional()
      .meta({
        description:
          "Validation errors keyed by fieldId. Apologise, ask the user to correct each, and retry submit_form.",
      }),
  }),
});

export const presentChoicesDef = toolDefinition({
  name: "present_choices",
  description:
    "Show the user a multiple-choice question with clickable buttons. Use this when the user's next answer falls into a small closed set (e.g. yes/no, choosing a service type, type of certificate, parent vs someone else). Do NOT use for open-ended answers like names, dates, or addresses. The UI renders the question from this tool call — DO NOT also type the question as plain text in the same turn.",
  inputSchema: z.object({
    question: z
      .string()
      .meta({ description: "The question to display to the user." }),
    choices: z.array(z.string()).min(2).meta({
      description:
        "Short option labels. Each becomes a button the user can click. For select/radio fields, include EVERY option value from the form schema, in the same order — never truncate, never invent. Length is determined by the schema, not by you.",
    }),
  }),
  outputSchema: z.object({
    shown: z.boolean().meta({
      description:
        "True once the UI has rendered the buttons. Your turn ends here — wait for the user's next message (their answer arrives as a normal user message, not as more tool data).",
    }),
  }),
});
