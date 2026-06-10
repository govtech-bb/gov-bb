import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEEDBACK_FORM_ID,
  FEEDBACK_TRIGGER_PHRASE,
  pinFeedbackForm,
  shouldBindFeedbackOffer,
} from "./feedback";
import { getOrCreateSession, resetSessionForNewForm } from "./form/session";
import { QUERY_STOP, TITLE_STOP, tokenize } from "./form/tokenize";

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

test("the Give feedback trigger phrase matches the chat-feedback recipe title", () => {
  // The banner link sends FEEDBACK_TRIGGER_PHRASE; the matcher (detect.ts) must
  // pin chat-feedback from it. Must equal the recipe title in
  // apps/api/.../recipes/chat-feedback/1.0.0.json.
  const CHAT_FEEDBACK_TITLE = "Give feedback on the assistant";
  const MIN_SCORE = 2; // detect.ts threshold
  const phraseToks = tokenize(FEEDBACK_TRIGGER_PHRASE, QUERY_STOP);
  const titleToks = tokenize(CHAT_FEEDBACK_TITLE, TITLE_STOP);
  let score = 0;
  for (const t of phraseToks) if (titleToks.has(t)) score++;
  assert.ok(score >= MIN_SCORE, `overlap ${score} must be >= ${MIN_SCORE}`);
  // "feedback" + "assistant" are unique to this recipe, so nothing out-scores it.
  assert.ok(phraseToks.has("feedback"));
  assert.ok(phraseToks.has("assistant"));
  // Statement, not a question, so run-turn enters collection rather than offer-only.
  assert.ok(!FEEDBACK_TRIGGER_PHRASE.trim().endsWith("?"));
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
