import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEEDBACK_FORM_ID,
  pinFeedbackForm,
  shouldBindFeedbackOffer,
} from "./feedback";
import { getOrCreateSession, resetSessionForNewForm } from "./form/session";

test("offer is bound only on a no-form turn that hasn't offered yet", () => {
  assert.equal(shouldBindFeedbackOffer("none", false), true);
  assert.equal(shouldBindFeedbackOffer("none", true), false); // already offered
  assert.equal(shouldBindFeedbackOffer("collect", false), false); // form active
  assert.equal(shouldBindFeedbackOffer("handoff", false), false); // handoff turn
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
