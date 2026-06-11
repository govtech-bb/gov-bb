import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFeedbackTools, buildFormTools, buildOfferTools } from "./tools";

// An offer-only turn (a collect-type form matched on an info question) must give
// the model present_choices — so it can offer a clickable "Start the
// application" — but NOT set_field/submit_form, so it can't silently start
// recording fields on what is still a question. Regression guard for the
// run-turn.ts `offerOnly` dead-end (the model could only offer in prose).
test("buildOfferTools registers present_choices only, not the field tools", () => {
  const tools = buildOfferTools();
  const names = tools.map((t) => (t as { name?: string }).name);

  assert.equal(tools.length, 1);
  assert.ok(names.includes("present_choices"));
  assert.ok(!names.includes("set_field"));
  assert.ok(!names.includes("submit_form"));
});

// Collection turns ask schema fields via ask_field (server-enriched spec →
// typed widget); present_choices stays for non-field closed questions.
// cancel_form is the abandon path — without it a user who says "never mind"
// stays trapped in the pinned form until the session TTL.
test("buildFormTools registers ask_field and the field tools", () => {
  const names = buildFormTools().map((t) => (t as { name?: string }).name);
  assert.deepEqual(names, [
    "present_choices",
    "ask_field",
    "set_field",
    "review_form",
    "submit_form",
    "cancel_form",
  ]);
});

// The feedback form has its own exit (decline_feedback); offering cancel_form
// too would give the model two near-identical ways out.
test("buildFeedbackTools swaps cancel_form for decline_feedback", () => {
  const names = buildFeedbackTools().map((t) => (t as { name?: string }).name);
  assert.ok(names.includes("decline_feedback"));
  assert.ok(!names.includes("cancel_form"));
});
