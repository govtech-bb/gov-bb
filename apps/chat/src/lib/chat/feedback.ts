import type { FormResolution } from "./form/schema";
import { resetSessionForNewForm, type FormSession } from "./form/session";

// Re-exported from a client-safe module: index.tsx (browser) imports the phrase
// from ./feedback-trigger directly, NOT from here — importing this module
// client-side would pull in form/session.ts (node:crypto) and break the bundle.
export { FEEDBACK_TRIGGER_PHRASE } from "./feedback-trigger";

// In-chat feedback reuses the conversational form pipeline. This must equal the
// recipe folder / formId at apps/api/.../recipes/chat-feedback/.
export const FEEDBACK_FORM_ID = "chat-feedback";

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
