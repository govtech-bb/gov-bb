import assert from "node:assert/strict";
import { test } from "node:test";
import type { Primitive, ServiceContract } from "@govtech-bb/form-types";
import {
  buildReviewItems,
  validateAndReshape,
  validateCollectedField,
} from "./values";

// Minimal contract with real validations so the shared
// @govtech-bb/form-validation engine actually runs its rules.
const FIELDS: Primitive[] = [
  {
    fieldId: "full-name",
    label: "Full name",
    htmlType: "text",
    validations: {
      required: { value: true },
      maxLength: { value: 10, error: "Name must be 10 characters or fewer" },
    },
  },
  {
    fieldId: "contact-email",
    label: "Email",
    htmlType: "email",
    validations: { email: {} },
  },
  {
    fieldId: "household-size",
    label: "Household size",
    htmlType: "number",
    validations: { max: { value: 20, error: "Cannot exceed 20" } },
  },
] as unknown as Primitive[];

const CONTRACT = {
  formId: "test-form",
  title: "Test Form",
  version: "1.0.0",
  createdAt: "2026-01-01T00:00:00",
  updatedAt: "2026-01-01T00:00:00",
  steps: [{ stepId: "step-1", title: "Step 1", elements: FIELDS }],
} as unknown as ServiceContract;

const field = (id: string) => FIELDS.find((f) => f.fieldId === id) as Primitive;

test("validateCollectedField rejects a rule violation with the recipe's message", () => {
  const error = validateCollectedField(
    CONTRACT,
    field("full-name"),
    "step-1",
    "a name that is far too long",
    {},
  );
  assert.equal(error, "Name must be 10 characters or fewer");
});

test("validateCollectedField rejects an invalid email via the engine", () => {
  const error = validateCollectedField(
    CONTRACT,
    field("contact-email"),
    "step-1",
    "not-an-email",
    {},
  );
  assert.ok(error, "expected an email validation error");
});

test("validateCollectedField surfaces coercion errors before rules", () => {
  const error = validateCollectedField(
    CONTRACT,
    field("household-size"),
    "step-1",
    "lots",
    {},
  );
  assert.equal(error, "must be a number");
});

test("validateCollectedField passes a valid value", () => {
  const error = validateCollectedField(
    CONTRACT,
    field("full-name"),
    "step-1",
    "Aaron",
    {},
  );
  assert.equal(error, null);
});

test("validateAndReshape fails a missing required field with the engine", () => {
  const result = validateAndReshape(CONTRACT, { "contact-email": "a@b.gov" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.field === "full-name"));
  }
});

test("validateAndReshape reshapes valid values by step", () => {
  const result = validateAndReshape(CONTRACT, {
    "full-name": "Aaron",
    "household-size": "4",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.valuesByStep["step-1"], {
      "full-name": "Aaron",
      "household-size": 4,
    });
  }
});

// Review rows must show what the user would see on the forms review step:
// option labels (not values), dates without the weekday, contract order,
// uncollected fields omitted.
test("buildReviewItems formats display values like the forms review", () => {
  const fields = [
    {
      fieldId: "parish",
      label: "Parish",
      htmlType: "select",
      options: [{ label: "Saint Michael", value: "st-michael" }],
    },
    { fieldId: "dob", label: "Date of birth", htmlType: "date" },
    { fieldId: "notes", label: "Notes", htmlType: "textarea" },
  ] as unknown as Primitive[];
  const contract = {
    formId: "review-form",
    title: "Review Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-01T00:00:00",
    steps: [{ stepId: "step-1", title: "Step 1", elements: fields }],
  } as unknown as ServiceContract;

  const items = buildReviewItems(
    contract,
    { parish: "st-michael", dob: "1990-05-04" },
    new Set(["parish", "dob", "notes"]),
  );
  assert.deepEqual(items, [
    { fieldId: "parish", label: "Parish", value: "Saint Michael" },
    { fieldId: "dob", label: "Date of birth", value: "May 04 1990" },
  ]);
});
