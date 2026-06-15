import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceContract } from "@govtech-bb/form-types";
import { buildFieldSpec } from "./field-spec";

const ratingContract = (): ServiceContract =>
  ({
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
              { label: "Poor", value: "poor" },
            ],
          },
        ],
      },
    ],
  }) as unknown as ServiceContract;

const field = (c: ServiceContract) => c.steps[0]!.elements[0]!;

// The widget payload carries the contract's label and options verbatim so the
// client renders the choice pills — this is what makes the rating re-appear on
// a deterministic re-present, identical to the model-driven ask_field result.
test("buildFieldSpec carries the contract label and options", () => {
  const c = ratingContract();
  const spec = buildFieldSpec(c, field(c), {}, new Set());
  assert.equal(spec.fieldId, "experience-rating");
  assert.equal(spec.label, "How was your experience?");
  assert.deepEqual(spec.options, [
    { label: "Very good", value: "very-good" },
    { label: "Poor", value: "poor" },
  ]);
});

// A show-hide toggle has no contract options; the spec synthesises Yes/No so
// the same choice-pill widget renders.
test("buildFieldSpec synthesises Yes/No for a show-hide toggle", () => {
  const c = ratingContract();
  const toggle = { ...field(c), htmlType: "show-hide", options: undefined };
  const spec = buildFieldSpec(c, toggle, {}, new Set());
  assert.deepEqual(spec.options, [
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
  ]);
});
