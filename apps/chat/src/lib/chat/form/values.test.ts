import assert from "node:assert/strict";
import { test } from "node:test";
import type { Primitive, ServiceContract } from "@govtech-bb/form-types";
import {
  buildReviewItems,
  canonicalizeRaw,
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

// ---------------------------------------------------------------------------
// show-hide toggles
// ---------------------------------------------------------------------------

const TOGGLE = {
  fieldId: "passport-toggle",
  label: "Use passport number instead",
  htmlType: "show-hide",
} as unknown as Primitive;

const TOGGLE_CONTRACT = {
  formId: "toggle-form",
  title: "Toggle Form",
  version: "1.0.0",
  createdAt: "2026-01-01T00:00:00",
  updatedAt: "2026-01-01T00:00:00",
  steps: [
    {
      stepId: "step-1",
      title: "Step 1",
      elements: [TOGGLE, ...FIELDS],
    },
  ],
} as unknown as ServiceContract;

// The condition engine compares the RAW session string against the recipe's
// `value: true` via String() coercion, so "yes"/"no" must be stored as
// exactly "true"/"false" or toggle-gated fields never activate.
test("canonicalizeRaw normalises show-hide answers to 'true'/'false'", () => {
  assert.equal(canonicalizeRaw(TOGGLE, "Yes"), "true");
  assert.equal(canonicalizeRaw(TOGGLE, "no"), "false");
  assert.equal(canonicalizeRaw(TOGGLE, "true"), "true");
  // Non-toggle fields pass through untouched.
  assert.equal(canonicalizeRaw(field("full-name"), "Yes"), "Yes");
});

test("show-hide answers coerce to a boolean and reject non-answers", () => {
  assert.equal(
    validateCollectedField(TOGGLE_CONTRACT, TOGGLE, "step-1", "yes", {}),
    null,
  );
  assert.equal(
    validateCollectedField(TOGGLE_CONTRACT, TOGGLE, "step-1", "maybe", {}),
    "must be yes/no",
  );
});

// Submission parity with the forms app, whose toggle holds a real boolean.
test("validateAndReshape submits the toggle as a boolean", () => {
  const result = validateAndReshape(TOGGLE_CONTRACT, {
    "passport-toggle": "true",
    "full-name": "Aaron",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.valuesByStep["step-1"]!["passport-toggle"], true);
  }
});

// Forms review parity: the toggle is a UI control, not an answer — never a row.
test("buildReviewItems omits show-hide toggles", () => {
  const items = buildReviewItems(
    TOGGLE_CONTRACT,
    { "passport-toggle": "true", "full-name": "Aaron" },
    new Set(["passport-toggle", "full-name"]),
  );
  assert.deepEqual(
    items.map((i) => i.fieldId),
    ["full-name"],
  );
});

// ---------------------------------------------------------------------------
// optionalIf relaxation — the escape-toggle flow must be submittable
// ---------------------------------------------------------------------------

// The real post-office shape: National ID required unless the passport
// toggle is open, passport number revealed by the toggle.
const ESCAPE_CONTRACT = {
  formId: "escape-form",
  title: "Escape Form",
  version: "1.0.0",
  createdAt: "2026-01-01T00:00:00",
  updatedAt: "2026-01-01T00:00:00",
  steps: [
    {
      stepId: "applicant-details",
      title: "Applicant details",
      elements: [
        {
          fieldId: "applicant-id-number",
          htmlType: "text",
          label: "National ID number",
          validations: {
            required: { value: true, error: "Enter your National ID number" },
          },
          behaviours: [
            {
              type: "optionalIf",
              targetFieldId: "passport-toggle",
              operator: "equal",
              value: true,
            },
          ],
        },
        {
          fieldId: "passport-toggle",
          htmlType: "show-hide",
          label: "Use passport number instead",
        },
        {
          fieldId: "applicant-passport-number",
          htmlType: "text",
          label: "Passport number",
          validations: { required: { value: true } },
          behaviours: [
            {
              type: "fieldConditionalOn",
              targetFieldId: "passport-toggle",
              targetStepId: "applicant-details",
              operator: "equal",
              value: true,
            },
          ],
        },
      ],
    },
  ],
} as unknown as ServiceContract;

// The shared validateField knows nothing about optionalIf — the forms app
// strips `required` first (validation-builder.ts) and chat must match, or
// the passport route dead-ends at submit with "ID required".
test("submit accepts a blank relaxed field when its escape toggle is open", () => {
  const values = {
    "passport-toggle": "true",
    "applicant-passport-number": "BB123456",
  };
  const active = new Set([
    "applicant-id-number",
    "passport-toggle",
    "applicant-passport-number",
  ]);
  const result = validateAndReshape(ESCAPE_CONTRACT, values, active);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.valuesByStep["applicant-details"], {
      "passport-toggle": true,
      "applicant-passport-number": "BB123456",
    });
  }
});

test("submit still requires the field when the toggle is closed", () => {
  const result = validateAndReshape(
    ESCAPE_CONTRACT,
    {},
    new Set(["applicant-id-number", "passport-toggle"]),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.errors, [
      {
        field: "applicant-id-number",
        message: "Enter your National ID number",
      },
    ]);
  }
});

// set_field-time parity: skipping the ID right after opening the toggle must
// not bounce, and format rules survive the relaxation.
test("validateCollectedField relaxes required when the escape is open", () => {
  const idField = ESCAPE_CONTRACT.steps[0]!.elements[0] as Primitive;
  assert.equal(
    validateCollectedField(ESCAPE_CONTRACT, idField, "applicant-details", "", {
      "passport-toggle": "true",
    }),
    null,
  );
});
