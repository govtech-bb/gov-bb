import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceContract } from "@govtech-bb/form-types";
import { matchPendingOption, recordOptionValue } from "./answer";
import type { ActiveFormSchema } from "./schema";
import type { FormSession } from "./session";

function form(): ActiveFormSchema {
  const contract = {
    formId: "chat-feedback",
    title: "Give feedback on the assistant",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-01T00:00:00",
    steps: [
      {
        stepId: "your-feedback",
        title: "Your feedback",
        elements: [
          {
            fieldId: "experience-rating",
            htmlType: "select",
            label: "How was your experience?",
            validations: { required: { value: true } },
            options: [
              { label: "Very good", value: "very-good" },
              { label: "Okay", value: "okay" },
              { label: "Poor", value: "poor" },
            ],
          },
          {
            fieldId: "improvement-comment",
            htmlType: "textarea",
            label: "What could be better?",
          },
        ],
      },
    ],
  } as unknown as ServiceContract;
  return { slug: "chat-feedback", contract } as unknown as ActiveFormSchema;
}

function session(overrides: Partial<FormSession> = {}): FormSession {
  return {
    threadId: "t1",
    slug: "chat-feedback",
    handedOffSlug: null,
    values: {},
    askedFieldIds: new Set(["experience-rating"]),
    reviewedSinceChange: false,
    submissionId: "s1",
    status: "collecting",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// The core fix: clicking "Okay" (its bare label) is recorded as the rating,
// not re-interpreted by the model as a filler word and rejected.
test("matchPendingOption maps an option label to its value (case-insensitive)", () => {
  const f = form();
  assert.equal(matchPendingOption(f, session(), "Okay")?.value, "okay");
  assert.equal(matchPendingOption(f, session(), "okay")?.value, "okay");
  assert.equal(matchPendingOption(f, session(), "OKAY")?.value, "okay");
  // The option's own value also matches.
  assert.equal(
    matchPendingOption(f, session(), "very-good")?.value,
    "very-good",
  );
});

// A message that isn't one of the options is a real free-text answer / question
// — leave it to the model.
test("matchPendingOption returns null for a non-option message", () => {
  assert.equal(matchPendingOption(form(), session(), "later maybe"), null);
});

// A free-text field (no options) is never deterministically matched.
test("matchPendingOption returns null once the cursor is on a free-text field", () => {
  const s = session({
    values: { "experience-rating": "okay" },
    askedFieldIds: new Set(["experience-rating", "improvement-comment"]),
  });
  // experience-rating answered; the cursor is on the optional free-text comment.
  assert.equal(matchPendingOption(form(), s, "Okay"), null);
});

// Recording stores the canonical value and invalidates any prior review.
test("recordOptionValue stores the value and resets reviewedSinceChange", () => {
  const f = form();
  const s = session({ reviewedSinceChange: true });
  const answer = matchPendingOption(f, s, "Okay")!;
  assert.equal(recordOptionValue(f, s, answer), true);
  assert.equal(s.values["experience-rating"], "okay");
  assert.equal(s.reviewedSinceChange, false);
});
