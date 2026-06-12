import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveTurnStatus, type TurnStatusFlags } from "./turn-status";
import { isUngroundedAnswer } from "./middleware/turn-log";

const base: TurnStatusFlags = {
  resolutionKind: "none",
  offerOnly: false,
  feedbackForm: false,
  linkRequested: false,
  serviceFeedback: false,
  handoffContinuation: false,
  formOffer: false,
  disambiguation: false,
  unapprovedForm: false,
  closer: false,
  noContext: false,
  missClarifyExhausted: false,
  offerFeedback: false,
  citationCount: 0,
};

test("each branch maps to its status, in precedence order", () => {
  const cases: Array<[Partial<TurnStatusFlags>, string]> = [
    [{ linkRequested: true, resolutionKind: "handoff" }, "link-requested"],
    [{ serviceFeedback: true }, "service-feedback"],
    [{ resolutionKind: "handoff" }, "handoff"],
    [{ resolutionKind: "collect" }, "collect"],
    [{ resolutionKind: "collect", feedbackForm: true }, "collect-feedback"],
    [{ resolutionKind: "collect", offerOnly: true }, "collect-offer"],
    [{ handoffContinuation: true, citationCount: 2 }, "handoff-continuation"],
    [{ formOffer: true, citationCount: 2 }, "form-offer"],
    [{ disambiguation: true, citationCount: 3 }, "disambiguation"],
    [{ closer: true }, "closer"],
    [{ noContext: true }, "miss-clarify"],
    [{ noContext: true, missClarifyExhausted: true }, "miss-exhausted"],
    [{ unapprovedForm: true, citationCount: 1 }, "unapproved-form"],
    [{ offerFeedback: true }, "feedback-offer"],
    [{ citationCount: 2 }, "answered"],
    [{}, "smalltalk"],
  ];
  for (const [flags, expected] of cases) {
    assert.equal(
      deriveTurnStatus({ ...base, ...flags }),
      expected,
      JSON.stringify(flags),
    );
  }
});

// The grounding flag (#1271): only an "answered" turn with citations supplied
// and no [N] marker in the final text counts — the wrong-service confident
// answer. Statuses that legitimately answer without markers never flag.

test("ungrounded only for marker-less answered turns with citations", () => {
  assert.equal(isUngroundedAnswer("answered", 3, "It costs $5."), true);
  assert.equal(isUngroundedAnswer("answered", 3, "It costs $5 [1]."), false);
  assert.equal(isUngroundedAnswer("answered", 0, "It costs $5."), false);
  assert.equal(isUngroundedAnswer("handoff", 3, "Here's the form."), false);
  assert.equal(isUngroundedAnswer("closer", 2, "Take care!"), false);
  assert.equal(isUngroundedAnswer("answered", 3, "   "), false);
  assert.equal(isUngroundedAnswer(undefined, 3, "text"), false);
});
