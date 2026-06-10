import type { FormResolution } from "./form/schema";
import { resetSessionForNewForm, type FormSession } from "./form/session";

// In-chat feedback reuses the conversational form pipeline. This must equal the
// recipe folder / formId at apps/api/.../recipes/chat-feedback/.
export const FEEDBACK_FORM_ID = "chat-feedback";

// Sent as a normal user message when the user clicks the "Give feedback" link in
// the notice banner. A first-person STATEMENT (not a question, so run-turn's
// isInfoQuestion treats it as apply-intent and starts collecting) containing the
// chat-feedback recipe title's distinctive tokens ("feedback", "assistant"), so
// the title matcher reliably pins that form. This is the manual counterpart to
// the model-initiated offer_feedback tool.
export const FEEDBACK_TRIGGER_PHRASE =
  "I would like to give feedback on the assistant";

// The offer_feedback tool is exposed only when no form is active and feedback
// hasn't already been offered this session — so the model can invite feedback
// at a natural conclusion without pestering or interrupting an in-progress form.
export function shouldBindFeedbackOffer(
  resolutionKind: FormResolution["kind"],
  feedbackOffered: boolean,
): boolean {
  return resolutionKind === "none" && !feedbackOffered;
}

// Pin the chat-feedback form so the normal collect flow takes over from the
// next turn. Resets any prior form state first (a clean session for the new
// form) and marks the offer spent so it is never made twice in one session.
export function pinFeedbackForm(session: FormSession): void {
  resetSessionForNewForm(session);
  session.slug = FEEDBACK_FORM_ID;
  session.feedbackOffered = true;
  session.updatedAt = Date.now();
}
