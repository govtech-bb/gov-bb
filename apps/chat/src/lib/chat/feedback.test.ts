import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEEDBACK_TRIGGER_PHRASE,
  shouldShowFeedbackAffordance,
} from "./feedback";
import { QUERY_STOP, TITLE_STOP, tokenize } from "./form/tokenize";

// Must equal the `title` of apps/api/.../recipes/chat-feedback/1.0.0.json.
// The "Give feedback" affordance only works if the matcher (detect.ts) pins
// this recipe from the trigger phrase, which is pure token overlap.
const CHAT_FEEDBACK_TITLE = "Give feedback on the assistant";
// detect.ts MIN_SCORE: overlapping meaningful tokens needed to call it a match.
const MIN_SCORE = 2;

function overlap(text: string, title: string): number {
  const textToks = tokenize(text, QUERY_STOP);
  const titleToks = tokenize(title, TITLE_STOP);
  let score = 0;
  for (const t of textToks) if (titleToks.has(t)) score++;
  return score;
}

test("trigger phrase matches the chat-feedback title above MIN_SCORE", () => {
  assert.ok(
    overlap(FEEDBACK_TRIGGER_PHRASE, CHAT_FEEDBACK_TITLE) >= MIN_SCORE,
    "trigger phrase must share enough tokens with the recipe title to match",
  );
});

test("trigger phrase carries the form's distinctive tokens", () => {
  // "feedback" + "assistant" are unique to this recipe, so no other form can
  // out-score it on the trigger phrase.
  const toks = tokenize(FEEDBACK_TRIGGER_PHRASE, QUERY_STOP);
  assert.ok(toks.has("feedback"));
  assert.ok(toks.has("assistant"));
});

test("trigger phrase is a statement, not a question", () => {
  // run-turn's isInfoQuestion treats "?"-suffixed or question-opener messages
  // as info-intent (offer only). A statement enters collection directly.
  assert.ok(!FEEDBACK_TRIGGER_PHRASE.trim().endsWith("?"));
  const firstWord = FEEDBACK_TRIGGER_PHRASE.trim()
    .toLowerCase()
    .split(/\s+/)[0];
  assert.equal(firstWord, "i");
});

test("affordance shows only after an exchange, when idle, and no form active", () => {
  assert.equal(shouldShowFeedbackAffordance(0, false, false), false); // no exchange yet
  assert.equal(shouldShowFeedbackAffordance(2, true, false), false); // mid-stream
  assert.equal(shouldShowFeedbackAffordance(2, false, true), false); // form collecting
  assert.equal(shouldShowFeedbackAffordance(2, false, false), true); // idle, ready
});
