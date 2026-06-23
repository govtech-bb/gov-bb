import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceContract } from "@govtech-bb/form-types";
import {
  applySubmit,
  missingRequired,
  reshapeByStep,
  validateAll,
} from "./submit.ts";

const contract = {
  formId: "f",
  title: "T",
  version: "1.2.0",
  steps: [
    {
      stepId: "applicant",
      title: "You",
      elements: [
        {
          fieldId: "first-name",
          label: "First name",
          htmlType: "text",
          validations: { required: {} },
        },
        {
          fieldId: "last-name",
          label: "Last name",
          htmlType: "text",
          validations: { required: {} },
        },
      ],
    },
    {
      stepId: "contact",
      title: "Contact",
      elements: [{ fieldId: "email", label: "Email", htmlType: "email" }],
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as ServiceContract;

const getDef = (async () => contract) as never;

test("reshapeByStep groups flat answers by their step", () => {
  const byStep = reshapeByStep(contract, {
    "first-name": "Jane",
    "last-name": "Doe",
    email: "j@x.com",
  });
  assert.deepEqual(byStep, {
    applicant: { "first-name": "Jane", "last-name": "Doe" },
    contact: { email: "j@x.com" },
  });
});

test("missingRequired flags an unanswered required field, ignores optional ones", () => {
  assert.deepEqual(
    missingRequired(contract, { "first-name": "Jane", "last-name": "Doe" }),
    [],
  );
  // email is not required → omitting it is fine; last-name is → flagged.
  const miss = missingRequired(contract, { "first-name": "Jane" });
  assert.deepEqual(
    miss.map((e) => e.field),
    ["last-name"],
  );
});

test("applySubmit blocks an incomplete form before any write", async () => {
  const r = await applySubmit(
    "f",
    { "first-name": "Jane" },
    { getDef, live: false },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors?.some((e) => e.field === "last-name"));
});

test("validateAll collects errors for invalid + unknown fields", () => {
  const errs = validateAll(contract, { "first-name": "", nope: "x" });
  const fields = errs.map((e) => e.field);
  assert.ok(fields.includes("first-name")); // required, empty
  assert.ok(fields.includes("nope")); // unknown
});

test("dry-run validates + shapes but does NOT write", async () => {
  let fetched = false;
  const r = await applySubmit(
    "f",
    { "first-name": "Jane", "last-name": "Doe" },
    {
      getDef,
      live: false,
      fetchImpl: (async () => {
        fetched = true;
        return {} as Response;
      }) as never,
    },
  );
  assert.deepEqual(r, { ok: true, dryRun: true });
  assert.equal(fetched, false, "must not POST in dry-run");
});

test("dry-run still rejects invalid answers before any write", async () => {
  const r = await applySubmit(
    "f",
    { "first-name": "" },
    { getDef, live: false },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors && r.errors.length > 0);
});

test("live POSTs the by-step body and returns the reference", async () => {
  let body: unknown;
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { referenceNumber: "PPM-123" } }),
    } as unknown as Response;
  }) as never;
  const r = await applySubmit(
    "f",
    { "first-name": "Jane", "last-name": "Doe" },
    { getDef, live: true, formApiUrl: "https://forms.example", fetchImpl },
  );
  assert.deepEqual(r, { ok: true, reference: "PPM-123" });
  assert.deepEqual(body, {
    formId: "f",
    formVersion: "1.2.0",
    values: { applicant: { "first-name": "Jane", "last-name": "Doe" } },
  });
});

// A feedback-shaped contract with the form-builder's regenerated declaration
// step. formId "chat-feedback" → the declaration is auto-confirmed.
const feedbackContract = {
  formId: "chat-feedback",
  title: "Feedback",
  version: "1.5.0",
  steps: [
    {
      stepId: "your-feedback",
      title: "Your feedback",
      elements: [
        {
          fieldId: "rating",
          label: "How was your experience?",
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as ServiceContract;

test("auto-confirms the feedback declaration: rating-only submit passes and POSTs confirmed", async () => {
  let body: { values?: unknown } | undefined;
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { referenceNumber: "FB-1" } }),
    } as unknown as Response;
  }) as never;
  const r = await applySubmit(
    "chat-feedback",
    { rating: "very-good" }, // declaration NOT collected
    {
      getDef: (async () => feedbackContract) as never,
      live: true,
      formApiUrl: "https://forms.example",
      fetchImpl,
    },
  );
  assert.deepEqual(r, { ok: true, reference: "FB-1" });
  assert.deepEqual(body?.values, {
    "your-feedback": { rating: "very-good" },
    declaration: { confirmation: ["confirmed"] },
  });
});

test("a non-feedback form's declaration is NOT auto-confirmed", async () => {
  const realForm = {
    ...feedbackContract,
    formId: "get-birth-certificate",
  } as unknown as ServiceContract;
  const r = await applySubmit(
    "get-birth-certificate",
    { rating: "very-good" }, // declaration genuinely missing
    { getDef: (async () => realForm) as never, live: false },
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors?.some((e) => e.field === "confirmation"));
});

test("live surfaces an upstream HTTP error", async () => {
  const fetchImpl = (async () => ({
    ok: false,
    status: 422,
    json: async () => ({ message: "bad submission" }),
  })) as never;
  const r = await applySubmit(
    "f",
    { "first-name": "Jane", "last-name": "Doe" },
    { getDef, live: true, formApiUrl: "https://forms.example", fetchImpl },
  );
  assert.equal(r.ok, false);
  assert.equal(r.errors?.[0].message, "bad submission");
});
