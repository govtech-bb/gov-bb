import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFormTools, buildOfferTools } from "./tools";

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

// Collection turns need both pickers: single-pick (radio/select/yes-no) and
// multi-pick (checkbox/multi-select fields, answered as a comma list).
test("buildFormTools registers both choice pickers and the field tools", () => {
  const names = buildFormTools().map((t) => (t as { name?: string }).name);
  assert.deepEqual(names, [
    "present_choices",
    "present_multi_choices",
    "set_field",
    "submit_form",
  ]);
});
