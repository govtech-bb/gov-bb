import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceContract } from "@govtech-bb/form-types";
import { extractFields, findField } from "./fields.ts";

// A loose contract shaped like a deployed ServiceContract — extractFields only
// reads steps/elements, so we don't need a schema-valid object.
const contract = (steps: unknown[]): ServiceContract =>
  ({
    formId: "f",
    title: "T",
    steps,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: "1.0.0",
  }) as unknown as ServiceContract;

test("flattens steps → elements in document order, with step + required", () => {
  const fields = extractFields(
    contract([
      {
        stepId: "s1",
        title: "Your details",
        elements: [
          {
            fieldId: "first-name",
            label: "First name",
            htmlType: "text",
            validations: { required: {} },
          },
          { fieldId: "middle-name", label: "Middle name", htmlType: "text" },
        ],
      },
      {
        stepId: "s2",
        title: "Contact",
        elements: [{ fieldId: "email", label: "Email", htmlType: "email" }],
      },
    ]),
  );
  assert.deepEqual(
    fields.map((f) => [f.fieldId, f.required, f.step]),
    [
      ["first-name", true, "Your details"],
      ["middle-name", false, "Your details"],
      ["email", false, "Contact"],
    ],
  );
});

test("carries options, hint, and multiple", () => {
  const [f] = extractFields(
    contract([
      {
        stepId: "s1",
        title: "S",
        elements: [
          {
            fieldId: "reason",
            label: "Reason",
            htmlType: "select",
            hint: "Pick one",
            multiple: true,
            options: [
              { label: "Birth", value: "birth" },
              { label: "Death", value: "death" },
            ],
          },
        ],
      },
    ]),
  );
  assert.equal(f.hint, "Pick one");
  assert.equal(f.multiple, true);
  assert.deepEqual(f.options, [
    { label: "Birth", value: "birth" },
    { label: "Death", value: "death" },
  ]);
});

test("skips hidden fields and show-hide disclosure toggles", () => {
  const fields = extractFields(
    contract([
      {
        stepId: "s1",
        title: "S",
        elements: [
          { fieldId: "visible", label: "Visible", htmlType: "text" },
          {
            fieldId: "secret",
            label: "Secret",
            htmlType: "text",
            isHidden: true,
          },
          { fieldId: "more", label: "More", htmlType: "show-hide" },
        ],
      },
    ]),
  );
  assert.deepEqual(
    fields.map((f) => f.fieldId),
    ["visible"],
  );
});

test("empty contract → no fields", () => {
  assert.deepEqual(extractFields(contract([])), []);
});

test("skips the feedback form's auto-confirmed declaration field", () => {
  const feedback = {
    formId: "chat-feedback",
    title: "Feedback",
    version: "1.5.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    steps: [
      {
        stepId: "your-feedback",
        title: "Your feedback",
        elements: [
          {
            fieldId: "rating",
            label: "Rating",
            htmlType: "radio",
            options: [{ label: "Very good", value: "very-good" }],
            validations: { required: {} },
          },
        ],
      },
      {
        stepId: "declaration",
        title: "Declaration",
        elements: [
          {
            fieldId: "confirmation",
            label: "I confirm...",
            htmlType: "checkbox",
            options: [{ label: "I confirm", value: "confirmed" }],
            validations: { required: {} },
          },
        ],
      },
    ],
  } as unknown as ServiceContract;
  assert.deepEqual(
    extractFields(feedback).map((f) => f.fieldId),
    ["rating"],
  );
});

test("findField returns the raw Primitive by id, or undefined", () => {
  const c = contract([
    {
      stepId: "s1",
      title: "S",
      elements: [{ fieldId: "email", label: "Email", htmlType: "email" }],
    },
  ]);
  assert.equal(findField(c, "email")?.fieldId, "email");
  assert.equal(findField(c, "nope"), undefined);
});
