import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const setFieldDef = toolDefinition({
  name: "set_field",
  description:
    "Record one form field value. fieldId MUST be an exact id from the FORM SCHEMA. Dates as ISO YYYY-MM-DD; for select/radio/checkbox pass the option's `value` (the option's label is also accepted). Call every time you learn a value (even single words); multiple calls per turn are fine.",
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
    // Schema lines for fields this value just activated (a conditional
    // section opened). They are part of the FORM SCHEMA now — ask them
    // next, in the order given, before any later field.
    revealed: z.array(z.string()).optional(),
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
    "Ask the user the NEXT form question. Call with NO arguments — the server picks the next field in order; you never choose. Pass a fieldId ONLY to re-ask a specific field (the user wants to change an answer, or submit returned a validation error naming it). The UI renders the right input (text box, date picker, choice buttons, multi-select) from the real form definition, including the label and options. Your visible text may hold only a brief lead-in or acknowledgement of the previous answer — never the question itself. END YOUR TURN after calling.",
  inputSchema: z.object({
    fieldId: z.string().optional().meta({
      description:
        "OMIT to get the next field in order. Pass an exact fieldId from the FORM SCHEMA only for a correction or validation-error re-ask.",
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
        // Escape-hatch toggle riding on this field (either/or, e.g. National
        // ID or passport). The widget renders it as a secondary button; if
        // the user picks it, set_field the TOGGLE fieldId to "yes" instead
        // of recording a value for this field.
        alternative: z
          .object({
            fieldId: z.string(),
            label: z.string(),
            hint: z.string().optional(),
          })
          .optional(),
        // Step title to show as a section header above this question, set
        // only when this field opens a new step (e.g. "Emergency contact
        // details") — so the user knows whose details to enter.
        section: z.string().optional(),
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
    // Lets the client word the submit step for feedback ("Submit your feedback
    // now?") rather than the default application copy. The submit_form approval
    // carries no args, but review_form runs in the same turn just before it.
    isFeedback: z.boolean().optional(),
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

export const cancelFormDef = toolDefinition({
  name: "cancel_form",
  description:
    "Call with NO arguments when the user clearly wants to ABANDON the in-progress application — e.g. 'cancel', 'never mind', 'stop', 'I don't want to do this anymore', 'forget it'. It discards everything collected and returns to normal chat; nothing is submitted. Do NOT call it on hesitation ('hmm', 'not sure') — ask whether they want to continue or stop. Do NOT call it when they just want to change an answer.",
  inputSchema: z.object({}),
  outputSchema: z.object({ ok: z.boolean() }),
});

export const offerFeedbackDef = toolDefinition({
  name: "offer_feedback",
  description:
    "Invite the user to give quick feedback on this assistant. Call with NO arguments, at most ONCE per conversation, and ONLY when the conversation has reached a natural conclusion — the user's need is met and they are wrapping up (e.g. 'thanks', 'that's all', 'no, that's everything'). Calling it READIES a short, optional feedback form (it opens only if they accept); after calling it, your entire visible reply is one short sentence asking WHETHER they'd like to give feedback (an invitation they can decline) — do NOT ask how their experience was, and do NOT also say you are opening or starting the form. The rating question itself is collected by the form once they accept. Never call it twice and never interrupt an unfinished task.",
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
