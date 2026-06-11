import assert from "node:assert/strict";
import { test } from "node:test";
import type { Primitive, ServiceContract } from "@govtech-bb/form-types";
import {
  describeField,
  nextAskableField,
  findEscapeToggle,
  getActiveFieldIds,
  isChatCollectable,
  needsHandoff,
  summarizeActive,
} from "./schema";

// Minimal contract builder — needsHandoff only reads formId, requiresPayment,
// and steps[].elements[].htmlType, so we don't construct a schema-valid recipe.
function contract(
  overrides: {
    formId?: string;
    requiresPayment?: boolean;
    htmlTypes?: string[];
  } = {},
): ServiceContract {
  const {
    formId = "some-collectible-form",
    requiresPayment,
    htmlTypes = ["text"],
  } = overrides;
  return {
    formId,
    title: "Test Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-01T00:00:00",
    requiresPayment,
    steps: [
      {
        stepId: "step-1",
        title: "Step 1",
        elements: htmlTypes.map((htmlType, i) => ({
          fieldId: `field-${i}`,
          label: `Field ${i}`,
          htmlType,
        })),
      },
    ],
  } as unknown as ServiceContract;
}

// A plain text-only form with no payment flag is the one thing we DO collect
// inline — the gate must not over-trigger, or every form becomes a dead link.
test("needsHandoff is false for a plain collectible form", () => {
  assert.equal(needsHandoff(contract()), false);
});

test("needsHandoff is true when any step has a file field", () => {
  assert.equal(needsHandoff(contract({ htmlTypes: ["text", "file"] })), true);
});

// Chat can't collect array inputs, so a REQUIRED repeatable field makes the
// form unsubmittable inline — the gate must hand off. An optional repeatable
// just gets skipped, so it must NOT trip the gate.
test("needsHandoff fires for required repeatable fields only", () => {
  const withRepeatable = (required: boolean) => {
    const c = contract();
    c.steps[0]!.elements.push({
      fieldId: "dependants",
      label: "Dependants",
      htmlType: "text",
      behaviours: [{ type: "repeatable" }],
      ...(required ? { validations: { required: { value: true } } } : {}),
    } as unknown as (typeof c.steps)[0]["elements"][0]);
    return c;
  };
  assert.equal(needsHandoff(withRepeatable(true)), true);
  assert.equal(needsHandoff(withRepeatable(false)), false);
});

test("needsHandoff is true when the contract requiresPayment", () => {
  assert.equal(needsHandoff(contract({ requiresPayment: true })), true);
});

// requiresPayment is optional on the public contract (z.boolean().optional()),
// so an absent/false flag must NOT trip the payment branch on its own.
test("needsHandoff payment branch only fires on an explicit true", () => {
  assert.equal(needsHandoff(contract({ requiresPayment: false })), false);
  assert.equal(needsHandoff(contract({ requiresPayment: undefined })), false);
});

test("needsHandoff is true for a form on the bank-details HANDOFF list", () => {
  assert.equal(
    needsHandoff(contract({ formId: "get-a-primary-school-textbook-grant" })),
    true,
  );
});

// The guaranteed-handoff backstop: these known-sensitive forms must hand off
// even if the live recipe drops `requiresPayment` or stops modelling its upload
// as a `file` field (the #965 regression class). Each entry corresponds to a
// payment or document-upload form that should never be collected inline.
for (const formId of [
  "get-birth-certificate", // payment — #916
  "get-death-certificate", // payment — #917
  "get-marriage-certificate", // payment — #918
  "apply-for-conductor-licence", // document upload — #921
  "sell-goods-services-beach-park", // document upload — #928
]) {
  test(`needsHandoff is true for known-sensitive form ${formId} regardless of contract flags`, () => {
    // No file field, no requiresPayment — the ID alone must force the handoff.
    assert.equal(needsHandoff(contract({ formId })), true);
  });
}

// ---------------------------------------------------------------------------
// show-hide toggles — collected as yes/no so toggle-gated fields are reachable
// ---------------------------------------------------------------------------

// Mirrors the real post-office-redirection shape: a passport-number field
// fieldConditionalOn the toggle being true.
function toggleContract(): ServiceContract {
  return {
    formId: "toggle-form",
    title: "Toggle Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-01T00:00:00",
    steps: [
      {
        stepId: "applicant-details",
        title: "Applicant details",
        elements: [
          {
            fieldId: "passport-toggle",
            htmlType: "show-hide",
            label: "Use passport number instead",
          },
          {
            fieldId: "applicant-passport-number",
            htmlType: "text",
            label: "Passport number",
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
}

// Uncollectable toggles made every toggle-gated field unreachable in chat —
// the toggle could never become true, so the conditional never activated.
test("show-hide is chat-collectable", () => {
  const toggle = toggleContract().steps[0]!.elements[0] as Primitive;
  assert.equal(isChatCollectable(toggle), true);
});

test("a 'true' toggle answer activates its conditional field", () => {
  const c = toggleContract();
  assert.equal(
    getActiveFieldIds(c, {}).flat.has("applicant-passport-number"),
    false,
  );
  assert.equal(
    getActiveFieldIds(c, { "passport-toggle": "false" }).flat.has(
      "applicant-passport-number",
    ),
    false,
  );
  // The canonical raw string "true" must match the recipe's `value: true`
  // through the condition engine's String() coercion.
  assert.equal(
    getActiveFieldIds(c, { "passport-toggle": "true" }).flat.has(
      "applicant-passport-number",
    ),
    true,
  );
});

// The toggle label is affordance text, not a question — the model needs the
// yes/no framing spelled out in the schema disclosure.
test("describeField frames show-hide as a yes/no section toggle", () => {
  const toggle = toggleContract().steps[0]!.elements[0] as Primitive;
  assert.equal(
    describeField(toggle),
    "- passport-toggle: show-hide section toggle (yes/no, optional)  // Use passport number instead",
  );
});

// ---------------------------------------------------------------------------
// escape-hatch toggles — an optionalIf target folds into its field's ask
// ---------------------------------------------------------------------------

// The real post-office shape: National ID required, passport-toggle relaxes
// it (optionalIf) and reveals the passport field (fieldConditionalOn).
function escapeContract(): ServiceContract {
  return {
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
            validations: { required: { value: true } },
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
}

const escapeField = (c: ServiceContract, id: string) =>
  c.steps[0]!.elements.find((f) => f.fieldId === id) as Primitive;

test("findEscapeToggle resolves an optionalIf show-hide target", () => {
  const c = escapeContract();
  assert.equal(
    findEscapeToggle(c, escapeField(c, "applicant-id-number"))?.fieldId,
    "passport-toggle",
  );
  // The conditional field itself has no escape — its behaviour is a reveal.
  assert.equal(
    findEscapeToggle(c, escapeField(c, "applicant-passport-number")),
    null,
  );
});

// Standalone "Use passport number instead?" with no ID question in sight is a
// non sequitur — the toggle rides on the ID field's line instead.
test("summarizeActive folds an escape toggle into its target field's line", () => {
  const c = escapeContract();
  const schema = summarizeActive(c, getActiveFieldIds(c, {}).byStep, {});
  assert.ok(schema);
  assert.match(
    schema,
    /applicant-id-number: text \(required; alternative: passport-toggle — "Use passport number instead"\)/,
  );
  assert.ok(!schema.includes("show-hide section toggle"));
});

// Once the user chose the alternative, "National ID (optional)?" right after
// "use my passport" is a dumb follow-up — drop the relaxed field unless they
// already answered it.
test("summarizeActive drops the relaxed field once the escape is open", () => {
  const c = escapeContract();
  const open = { "passport-toggle": "true" };
  const schema = summarizeActive(c, getActiveFieldIds(c, open).byStep, open);
  assert.ok(schema);
  assert.ok(!schema.includes("applicant-id-number"));
  assert.ok(schema.includes("applicant-passport-number"));

  const answered = { "passport-toggle": "true", "applicant-id-number": "123" };
  const both = summarizeActive(
    c,
    getActiveFieldIds(c, answered).byStep,
    answered,
  );
  assert.ok(both?.includes("applicant-id-number"));
});

// A pure reveal toggle (no optionalIf anywhere) keeps its standalone yes/no
// question — only escape toggles fold away.
test("summarizeActive keeps a pure reveal toggle as its own line", () => {
  const c = toggleContract();
  const schema = summarizeActive(c, getActiveFieldIds(c, {}).byStep, {});
  assert.ok(
    schema?.includes(
      "- passport-toggle: show-hide section toggle (yes/no, optional)",
    ),
  );
});

// ---------------------------------------------------------------------------
// ask cursor — ordering lives in code, not in the model
// ---------------------------------------------------------------------------

function cursorContract(): ServiceContract {
  return {
    formId: "cursor-form",
    title: "Cursor Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-01T00:00:00",
    steps: [
      {
        stepId: "step-1",
        title: "Step 1",
        elements: [
          { fieldId: "first-name", htmlType: "text", label: "First name" },
          { fieldId: "comment", htmlType: "textarea", label: "Comment" },
        ],
      },
      {
        stepId: "step-2",
        title: "Step 2",
        elements: [{ fieldId: "parish", htmlType: "text", label: "Parish" }],
      },
    ],
  } as unknown as ServiceContract;
}

test("nextAskableField walks step order, skipping collected and asked", () => {
  const c = cursorContract();
  const none = new Set<string>();
  assert.equal(nextAskableField(c, {}, none)?.field.fieldId, "first-name");
  // Collected moves the cursor on.
  assert.equal(
    nextAskableField(c, { "first-name": "Aaron" }, none)?.field.fieldId,
    "comment",
  );
  // Asked-but-uncollected = the user skipped an optional field — advance,
  // don't loop on it.
  assert.equal(
    nextAskableField(c, { "first-name": "Aaron" }, new Set(["comment"]))?.field
      .fieldId,
    "parish",
  );
  // Everything presented → null (review time).
  assert.equal(
    nextAskableField(
      c,
      { "first-name": "Aaron", parish: "St Michael" },
      new Set(["comment"]),
    ),
    null,
  );
});

// The cursor shares the disclosure's escape-toggle folding: the toggle is
// never served standalone, and the relaxed field disappears once the escape
// is open — the cursor serves the revealed field instead.
test("nextAskableField applies escape folding and serves revealed fields", () => {
  const c = escapeContract();
  const none = new Set<string>();
  assert.equal(
    nextAskableField(c, {}, none)?.field.fieldId,
    "applicant-id-number",
  );
  const open = { "passport-toggle": "true" };
  assert.equal(
    nextAskableField(c, open, none)?.field.fieldId,
    "applicant-passport-number",
  );
});

// ---------------------------------------------------------------------------
// auto-confirmed fields — the feedback form's declaration is filled silently
// ---------------------------------------------------------------------------

// The form-builder always regenerates a required "declaration" step on the
// chat-feedback recipe. In chat we confirm it for the user, so it must never
// be disclosed to the model or served by the ask cursor — otherwise the model
// asks the user to "confirm the declaration", the exact ceremony #1114 removed.
function feedbackDeclarationContract(formId: string): ServiceContract {
  return {
    formId,
    title: "Give feedback on the assistant",
    version: "1.5.0",
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-01T00:00:00",
    steps: [
      {
        stepId: "your-feedback",
        title: "Your feedback",
        elements: [
          { fieldId: "experience-rating", htmlType: "text", label: "Rating" },
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
            validations: { required: { value: true } },
          },
        ],
      },
    ],
  } as unknown as ServiceContract;
}

test("summarizeActive hides the feedback declaration but keeps real fields", () => {
  const c = feedbackDeclarationContract("chat-feedback");
  const schema = summarizeActive(c, getActiveFieldIds(c, {}).byStep, {});
  assert.ok(schema);
  assert.ok(schema.includes("experience-rating"));
  assert.ok(!schema.includes("declaration-confirmed"));
});

test("nextAskableField never serves the auto-confirmed feedback declaration", () => {
  const c = feedbackDeclarationContract("chat-feedback");
  const none = new Set<string>();
  // Rating answered → the cursor would normally land on the declaration next,
  // but it is auto-confirmed, so collection is complete (null = review time).
  assert.equal(
    nextAskableField(c, { "experience-rating": "good" }, none),
    null,
  );
});

test("a real form's declaration is still asked — auto-confirm is feedback-only", () => {
  const c = feedbackDeclarationContract("get-birth-certificate");
  const schema = summarizeActive(c, getActiveFieldIds(c, {}).byStep, {});
  assert.ok(schema?.includes("declaration-confirmed"));
  assert.equal(
    nextAskableField(c, { "experience-rating": "good" }, new Set())?.field
      .fieldId,
    "declaration-confirmed",
  );
});
