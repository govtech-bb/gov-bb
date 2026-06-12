import assert from "node:assert/strict";
import test from "node:test";
import type { Primitive, ServiceContract } from "@govtech-bb/form-types";
import {
  CHANGE_FIELD_PREFIX,
  formatChangeRequest,
  parseChangeRequest,
} from "../change-field";
import { matchChangeField, resetFieldForChange } from "./change";
import type { ActiveFormSchema } from "./schema";
import type { FormSession } from "./session";

// A feedback-shaped contract: one required choice (the rating), one optional
// free-text (the improvement note), and a show-hide toggle (never a row, so
// never changeable). Two fields deliberately share a label to exercise the
// ambiguity guard.
const RATING = {
  fieldId: "experience",
  label: "How was your experience with the assistant?",
  htmlType: "select",
  required: { value: true },
  options: [
    { label: "Very good", value: "very-good" },
    { label: "Okay", value: "okay" },
    { label: "Very poor", value: "very-poor" },
  ],
} as unknown as Primitive;

const IMPROVE = {
  fieldId: "improve",
  label: "What could we do to improve?",
  htmlType: "textarea",
} as unknown as Primitive;

const DUP_A = {
  fieldId: "dup-a",
  label: "Anything else?",
  htmlType: "text",
} as unknown as Primitive;

const DUP_B = {
  fieldId: "dup-b",
  label: "Anything else?",
  htmlType: "text",
} as unknown as Primitive;

const TOGGLE = {
  fieldId: "toggle",
  label: "Show more",
  htmlType: "show-hide",
} as unknown as Primitive;

const CONTRACT = {
  formId: "chat-feedback",
  title: "Feedback",
  version: "1.0.0",
  createdAt: "2026-01-01T00:00:00",
  updatedAt: "2026-01-01T00:00:00",
  steps: [
    {
      stepId: "step-1",
      title: "Step 1",
      elements: [RATING, IMPROVE, DUP_A, DUP_B, TOGGLE],
    },
  ],
} as unknown as ServiceContract;

const FORM = {
  slug: "chat-feedback",
  contract: CONTRACT,
} as unknown as ActiveFormSchema;

function session(values: Record<string, string> = {}): FormSession {
  return {
    threadId: "t1",
    slug: "chat-feedback",
    handedOffSlug: null,
    values,
    askedFieldIds: new Set<string>(),
    reviewedSinceChange: false,
    submissionId: "s1",
    status: "collecting",
    createdAt: 0,
    updatedAt: 0,
  };
}

// ---------------------------------------------------------------------------
// parseChangeRequest / formatChangeRequest (client-safe string contract)
// ---------------------------------------------------------------------------

test("formatChangeRequest prefixes the label", () => {
  assert.equal(
    formatChangeRequest("How was your experience with the assistant?"),
    `${CHANGE_FIELD_PREFIX}How was your experience with the assistant?`,
  );
});

test("parseChangeRequest round-trips a formatted request", () => {
  const label = "How was your experience with the assistant?";
  assert.equal(parseChangeRequest(formatChangeRequest(label)), label);
});

test("parseChangeRequest returns null for a non-change message", () => {
  assert.equal(parseChangeRequest("Okay"), null);
  assert.equal(parseChangeRequest("I would like to give feedback"), null);
});

test("parseChangeRequest rejects an empty label", () => {
  assert.equal(parseChangeRequest(CHANGE_FIELD_PREFIX), null);
  assert.equal(parseChangeRequest(`${CHANGE_FIELD_PREFIX}   `), null);
});

// ---------------------------------------------------------------------------
// matchChangeField (server-side label -> field resolution)
// ---------------------------------------------------------------------------

test("matchChangeField resolves a change request to its field", () => {
  const match = matchChangeField(
    FORM,
    session({ experience: "okay" }),
    formatChangeRequest("How was your experience with the assistant?"),
  );
  assert.equal(match?.field.fieldId, "experience");
  assert.equal(match?.stepId, "step-1");
});

test("matchChangeField is case- and whitespace-insensitive on the label", () => {
  const match = matchChangeField(
    FORM,
    session({ experience: "okay" }),
    `${CHANGE_FIELD_PREFIX}  how was your experience with the assistant?  `,
  );
  assert.equal(match?.field.fieldId, "experience");
});

test("matchChangeField returns null for a non-change message", () => {
  assert.equal(matchChangeField(FORM, session(), "Okay"), null);
});

test("matchChangeField returns null for an unknown label", () => {
  assert.equal(
    matchChangeField(FORM, session(), formatChangeRequest("Your shoe size")),
    null,
  );
});

test("matchChangeField returns null when the label is ambiguous", () => {
  assert.equal(
    matchChangeField(FORM, session(), formatChangeRequest("Anything else?")),
    null,
  );
});

test("matchChangeField never targets a show-hide toggle", () => {
  assert.equal(
    matchChangeField(FORM, session(), formatChangeRequest("Show more")),
    null,
  );
});

// ---------------------------------------------------------------------------
// resetFieldForChange
// ---------------------------------------------------------------------------

test("resetFieldForChange clears the value and invalidates the review", () => {
  const s = session({ experience: "okay" });
  s.reviewedSinceChange = true;
  resetFieldForChange(s, "experience");
  assert.equal(s.values.experience, undefined);
  assert.equal(s.reviewedSinceChange, false);
});
