import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceContract } from "@govtech-bb/form-types";
import { needsHandoff } from "./schema";

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
