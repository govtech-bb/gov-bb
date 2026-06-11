import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cancelFeedbackForm,
  FEEDBACK_FORM_ID,
  FEEDBACK_TRIGGER_PHRASE,
  pinFeedbackForm,
  shouldBindFeedbackOffer,
  shouldReleaseFeedbackOffer,
  submitSuccessForModel,
} from "./feedback";
import type { FormResolution } from "./form/schema";
import { getOrCreateSession, resetSessionForNewForm } from "./form/session";

const collectResolution = (slug: string): FormResolution =>
  ({ kind: "collect", form: { slug } }) as unknown as FormResolution;

test("offer is bound only on a no-form turn that hasn't offered yet", () => {
  assert.equal(shouldBindFeedbackOffer("none", false), true);
  assert.equal(shouldBindFeedbackOffer("none", true), false); // already offered
  assert.equal(shouldBindFeedbackOffer("collect", false), false); // form active
  assert.equal(shouldBindFeedbackOffer("handoff", false), false); // handoff turn
});

test("releases a zero-value feedback pin when retrieval surfaces a real service", () => {
  // The trap (#1202): a zero-value feedback pin suppresses RAG routing, so a
  // user who changes topic to a real service ("conductor license") gets stuck.
  // A retrieved service candidate is the release signal.
  assert.equal(
    shouldReleaseFeedbackOffer(collectResolution(FEEDBACK_FORM_ID), 0, true),
    true,
  );
});

test("keeps a zero-value feedback pin when retrieval found no service", () => {
  // A genuine rating reply ("it was good") surfaces no service candidate —
  // stay pinned so the feedback form keeps collecting.
  assert.equal(
    shouldReleaseFeedbackOffer(collectResolution(FEEDBACK_FORM_ID), 0, false),
    false,
  );
});

test("keeps an in-progress feedback form even when a service is retrieved", () => {
  // A value already captured: real collection, grounded via retrievalBoostSlug,
  // not an open offer — never released.
  assert.equal(
    shouldReleaseFeedbackOffer(collectResolution(FEEDBACK_FORM_ID), 1, true),
    false,
  );
});

test("never releases a real service form via the feedback path", () => {
  assert.equal(
    shouldReleaseFeedbackOffer(collectResolution("get-passport"), 0, true),
    false,
  );
});

test("no release when no form is pinned", () => {
  assert.equal(shouldReleaseFeedbackOffer({ kind: "none" }, 0, true), false);
});

test("pinFeedbackForm pins the feedback form and marks the offer spent", () => {
  const s = getOrCreateSession("t-pin-1");
  s.slug = "get-birth-certificate";
  s.values = { "applicant-name": "Jo" };
  pinFeedbackForm(s);
  assert.equal(s.slug, FEEDBACK_FORM_ID);
  assert.equal(s.feedbackOffered, true);
  assert.deepEqual(s.values, {}); // prior form state cleared
  assert.equal(s.status, "collecting");
});

// The banner trigger phrase is now pinned to chat-feedback by EXPLICIT id in
// pinSessionForm (see routing.test.ts), not by title-token overlap, so there is
// no longer a title-uniqueness contract to guard here (#1206). It must still be
// a statement, not a question, so the turn enters collect-feedback (offerOnly
// reads isInfoQuestion) rather than offer-only.
test("the Give feedback trigger phrase is a statement, not a question", () => {
  assert.ok(!FEEDBACK_TRIGGER_PHRASE.trim().endsWith("?"));
});

test("cancelFeedbackForm unpins the form but keeps the offer spent", () => {
  // A declined offer must return the session to normal chat (slug cleared) so a
  // later question isn't trapped in feedback-collection — but feedbackOffered
  // must stay set so we don't re-pester the user who already said no.
  const s = getOrCreateSession("t-cancel-1");
  pinFeedbackForm(s);
  assert.equal(s.slug, FEEDBACK_FORM_ID);
  cancelFeedbackForm(s);
  assert.equal(s.slug, null); // back to normal chat
  assert.equal(s.feedbackOffered, true); // but never offered again
});

test("submitSuccessForModel hides the reference for feedback, keeps it for real forms", () => {
  // Feedback is conversational, not transactional: the model must thank the
  // user, not recite a permit-style reference number. The upstream reference is
  // still kept on the session (no-resubmit guard) — it's just withheld from the
  // model's success result so it has nothing to report.
  assert.deepEqual(submitSuccessForModel(FEEDBACK_FORM_ID, "REF-123"), {
    ok: true,
  });
  // Every real service form keeps its reference in the success result.
  assert.deepEqual(submitSuccessForModel("get-birth-certificate", "REF-123"), {
    ok: true,
    referenceNumber: "REF-123",
  });
});

test("resetSessionForNewForm preserves feedbackOffered", () => {
  // Load-bearing invariant: pinFeedbackForm resets the session for the feedback
  // form via resetSessionForNewForm, so if that reset cleared feedbackOffered
  // the offer could fire again. It must survive the reset.
  const s = getOrCreateSession("t-reset-1");
  s.feedbackOffered = true;
  s.slug = "get-birth-certificate";
  s.values = { x: "1" };
  resetSessionForNewForm(s);
  assert.equal(s.feedbackOffered, true); // must NOT be cleared
  assert.equal(s.slug, null); // but the form state is reset
});
