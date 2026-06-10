// End-of-chat feedback. Rather than a bespoke endpoint, feedback is collected
// like any other government form: the "Give feedback" affordance sends a short
// apply-intent phrase that the form matcher (detect.ts) pins to the
// `chat-feedback` recipe, and the normal collect -> submit_form flow emails the
// submission via the recipe's email processor. See issue #1066.

// Must equal the recipe folder / formId at
// apps/api/src/forms/form-definitions/recipes/chat-feedback/.
export const FEEDBACK_FORM_ID = "chat-feedback";

// Sent verbatim when the user clicks "Give feedback". Deliberately a first-
// person STATEMENT (not a question) so run-turn's isInfoQuestion heuristic
// treats it as apply-intent and starts collecting, rather than merely offering.
// It contains the chat-feedback recipe title's distinctive tokens ("feedback",
// "assistant") so the title-token matcher reliably pins that form.
export const FEEDBACK_TRIGGER_PHRASE =
  "I would like to give feedback on the assistant";

// The affordance only makes sense once there is something to give feedback on:
// at least one message exchanged, not mid-stream (sending is disabled then),
// and not while a form is actively being collected. The last condition matters
// because run-turn's pinSessionForm won't re-pin a form mid-collection, so the
// trigger phrase would be swallowed by the in-progress form instead of starting
// feedback — hide the button until that form finishes (issue #1066).
export function shouldShowFeedbackAffordance(
  messageCount: number,
  streaming: boolean,
  formActive: boolean,
): boolean {
  return messageCount > 0 && !streaming && !formActive;
}
