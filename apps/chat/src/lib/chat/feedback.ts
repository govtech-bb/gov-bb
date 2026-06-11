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

// The mirror of shouldBindFeedbackOffer on the other side of the offer. A
// zero-value chat-feedback pin (whether matcher- or offer_feedback-pinned) is
// really an OPEN OFFER, not active collection. Because a pinned form suppresses
// the RAG routing backstop (applyRagFallback / disambiguation gate on no form
// pinned), a user who changes topic to a real service can get trapped on the
// feedback form: the title matcher misses natural phrasings (e.g. "conductor
// license" vs the "licence" title — only one overlapping token, below the
// match threshold), and a non-question never trips the pinSessionForm release.
// So when THIS turn's retrieval surfaces a real service, treat it as a topic
// switch and release the pin, letting the normal no-form path route (#1202).
// The caller releases via cancelFeedbackForm, which preserves feedbackOffered —
// a topic switch reads as an implicit decline, never re-offered this session.
export function shouldReleaseFeedbackOffer(
  resolution: FormResolution,
  valueCount: number,
  hasServiceCandidate: boolean,
): boolean {
  return (
    resolution.kind === "collect" &&
    resolution.form.slug === FEEDBACK_FORM_ID &&
    valueCount === 0 &&
    hasServiceCandidate
  );
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

// Shape the submit_form success result the MODEL sees. Feedback is
// conversational, not transactional: the user gets a warm thank-you, not a
// permit-style reference number. submit_form still records the upstream
// reference on the session (the no-resubmit guard reads it) — we just withhold
// it from the model's result for the feedback form, so it has nothing to
// recite. Every real service form keeps its reference unchanged. Paired with
// FEEDBACK_COLLECTION_GUIDANCE, which tells the model to thank rather than
// report a reference on a feedback submit.
export function submitSuccessForModel(
  slug: string | null | undefined,
  referenceNumber: string,
): { ok: true; referenceNumber?: string } {
  if (slug === FEEDBACK_FORM_ID) return { ok: true };
  return { ok: true, referenceNumber };
}

// The user was invited to give feedback (which pins the form) but declined, or
// bailed mid-form. Unpin so the session returns to normal chat. feedbackOffered
// survives resetSessionForNewForm, so the offer is never repeated this session —
// we don't pester someone who already said no.
export function cancelFeedbackForm(session: FormSession): void {
  resetSessionForNewForm(session);
}
