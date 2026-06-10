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

export const askFieldDef = toolDefinition({
  name: "ask_field",
  description:
    "Ask the user for ONE form field from the FORM SCHEMA. Pass ONLY the fieldId — the UI renders the right input (text box, date picker, choice buttons, multi-select) from the real form definition, including the label and options. Your visible text may hold only a brief lead-in or acknowledgement of the previous answer — never the question itself. END YOUR TURN after calling.",
  inputSchema: z.object({
    fieldId: z.string().meta({
      description: "Exact fieldId from the FORM SCHEMA system message.",
    }),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    field: z
      .object({
        fieldId: z.string(),
        label: z.string(),
        htmlType: z.string(),
        hint: z.string().optional(),
        multiple: z.boolean().optional(),
        options: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .optional(),
        // Raw validation rules from the contract, so the widget can run the
        // shared validation engine client-side before sending the answer.
        validations: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  }),
});

export const reviewFormDef = toolDefinition({
  name: "review_form",
  description:
    "Show the user a structured check-your-answers summary of every collected value. Call with NO arguments once every required field is collected, then call submit_form in the SAME turn. The UI renders the summary from the form session — NEVER list the values in your text reply; a one-line lead-in is fine.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    items: z
      .array(
        z.object({
          fieldId: z.string(),
          label: z.string(),
          value: z.string(),
        }),
      )
      .optional(),
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

export const offerFeedbackDef = toolDefinition({
  name: "offer_feedback",
  description:
    "Invite the user to give quick feedback on this assistant. Call with NO arguments, at most ONCE per conversation, and ONLY when the conversation has reached a natural conclusion — the user's need is met and they are wrapping up (e.g. 'thanks', 'that's all', 'no, that's everything'). Calling it opens a short, optional feedback form; after calling it, ask in one short sentence WHETHER they'd like to give feedback (an invitation they can decline) — do NOT ask how their experience was. The rating question itself is collected by the form once they accept. Never call it twice and never interrupt an unfinished task.",
  inputSchema: z.object({}),
  outputSchema: z.object({ ok: z.boolean() }),
});

export const declineFeedbackDef = toolDefinition({
  name: "decline_feedback",
  description:
    "Call with NO arguments when the user declines the feedback invitation, or no longer wants to continue the feedback form — e.g. 'no', 'no thanks', 'not now', 'maybe later', or they simply say goodbye without engaging. It closes the optional feedback form and returns to normal chat. Do NOT call it if the user is willing to give feedback.",
  inputSchema: z.object({}),
  outputSchema: z.object({ ok: z.boolean() }),
});
