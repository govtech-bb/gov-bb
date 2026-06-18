import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceContract } from "@govtech-bb/form-types";
import { lookupForm } from "./form-definition.ts";

const contract = (over: Partial<ServiceContract> = {}): ServiceContract =>
  ({
    formId: "get-death-certificate",
    title: "Get a copy of a death certificate",
    steps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: "1.0.0",
    ...over,
  }) as ServiceContract;

const never = async () => {
  throw new Error("getDef should not be called");
};

test("found:false for a form with no policy entry — and doesn't hit the API", async () => {
  const out = await lookupForm("some-unapproved-form", {}, never as never);
  assert.deepEqual(out, { found: false });
});

test("found:true with mode + title for an approved, loadable form", async () => {
  const out = await lookupForm("get-death-certificate", {}, (async () =>
    contract({ requiresPayment: true })) as never);
  assert.equal(out.found, true);
  assert.equal(out.mode, "handoff");
  assert.equal(out.title, "Get a copy of a death certificate");
  assert.equal(out.requiresPayment, true);
});

test("requiresPayment defaults to false when the contract omits it", async () => {
  const out = await lookupForm("project-protege-mentor", {}, (async () =>
    contract({ formId: "project-protege-mentor" })) as never);
  assert.equal(out.mode, "collect");
  assert.equal(out.requiresPayment, false);
});

test("includes the form's fields for collection", async () => {
  const out = await lookupForm("project-protege-mentor", {}, (async () =>
    contract({
      formId: "project-protege-mentor",
      steps: [
        {
          stepId: "s1",
          title: "You",
          elements: [
            {
              fieldId: "first-name",
              label: "First name",
              htmlType: "text",
              validations: { required: {} },
            },
          ],
        },
      ],
    } as never)) as never);
  assert.equal(out.found, true);
  assert.equal(out.fields?.length, 1);
  assert.equal(out.fields?.[0].fieldId, "first-name");
  assert.equal(out.fields?.[0].required, true);
});

test("found:false when an approved form fails to load (null contract)", async () => {
  const out = await lookupForm(
    "get-death-certificate",
    {},
    (async () => null) as never,
  );
  assert.deepEqual(out, { found: false });
});
