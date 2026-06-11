import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceContract } from "@govtech-bb/form-types";
import { applyAutoConfirmedValues, isAutoConfirmedField } from "./auto-confirm";
import { getActiveFieldIds } from "./schema";
import { validateAndReshape } from "./values";

// Mirrors the real chat-feedback recipe (apps/api/.../chat-feedback/1.5.0.json):
// a rating + optional comment, then the form-builder's always-regenerated,
// required "declaration" step whose confirmation checkbox carries a single
// option { value: "confirmed" }.
function feedbackContract(): ServiceContract {
  return {
    formId: "chat-feedback",
    title: "Give feedback on the assistant",
    version: "1.5.0",
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
            options: [
              { label: "Good", value: "good" },
              { label: "Poor", value: "poor" },
            ],
            validations: { required: { value: true } },
          },
          {
            fieldId: "improvement-comment",
            htmlType: "textarea",
            label: "What could we improve?",
          },
        ],
      },
      {
        stepId: "declaration",
        title: "Declaration",
        elements: [
          {
            fieldId: "declaration-confirmed",
            htmlType: "checkbox",
            label: "Declaration",
            options: [{ label: "I confirm", value: "confirmed" }],
            validations: {
              required: {
                value: true,
                error: "You must confirm the declaration to continue",
              },
            },
          },
        ],
      },
    ],
  } as unknown as ServiceContract;
}

// A real government form whose declaration is legally load-bearing — it must
// NEVER be auto-confirmed. Same shape, different formId.
function realFormContract(): ServiceContract {
  const c = feedbackContract();
  return { ...c, formId: "get-birth-certificate" } as ServiceContract;
}

test("isAutoConfirmedField targets the feedback form's declaration step only", () => {
  const fb = feedbackContract();
  assert.equal(isAutoConfirmedField(fb, "declaration-confirmed"), true);
  // Other fields on the same form are not auto-confirmed.
  assert.equal(isAutoConfirmedField(fb, "experience-rating"), false);
  // The same declaration field on a real form is NOT auto-confirmed.
  assert.equal(
    isAutoConfirmedField(realFormContract(), "declaration-confirmed"),
    false,
  );
});

test("applyAutoConfirmedValues fills the declaration with its option value", () => {
  const values: Record<string, string> = { "experience-rating": "good" };
  applyAutoConfirmedValues(feedbackContract(), values);
  // The confirmation checkbox stores the OPTION value, not a boolean — that's
  // what the submit coercer (coerceList) and the forms API expect.
  assert.equal(values["declaration-confirmed"], "confirmed");
  // It does not touch the user's own fields.
  assert.equal(values["experience-rating"], "good");
});

test("applyAutoConfirmedValues leaves real forms untouched", () => {
  const values: Record<string, string> = {};
  applyAutoConfirmedValues(realFormContract(), values);
  assert.equal(values["declaration-confirmed"], undefined);
});

test("applyAutoConfirmedValues does not overwrite an existing value", () => {
  const values: Record<string, string> = {
    "declaration-confirmed": "already",
  };
  applyAutoConfirmedValues(feedbackContract(), values);
  assert.equal(values["declaration-confirmed"], "already");
});

// The point of auto-confirm: a feedback submission with only the user's rating
// would FAIL the required declaration. Seeding it makes the same submission
// validate, so the upstream forms API accepts it.
test("seeding the declaration makes a rating-only submission valid", () => {
  const c = feedbackContract();
  const userValues: Record<string, string> = { "experience-rating": "good" };

  const withoutSeed = validateAndReshape(
    c,
    userValues,
    getActiveFieldIds(c, userValues).flat,
  );
  assert.equal(withoutSeed.ok, false, "declaration is required, so this fails");

  const seeded = { ...userValues };
  applyAutoConfirmedValues(c, seeded);
  const withSeed = validateAndReshape(
    c,
    seeded,
    getActiveFieldIds(c, seeded).flat,
  );
  assert.equal(withSeed.ok, true);
  if (withSeed.ok) {
    // The confirmed declaration rides into the submitted payload as the array
    // the forms API stores for a single-option checkbox.
    assert.deepEqual(withSeed.valuesByStep["declaration"], {
      "declaration-confirmed": ["confirmed"],
    });
  }
});
