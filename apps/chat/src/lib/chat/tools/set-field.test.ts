import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceContract } from "@govtech-bb/form-types";
import { applySetField } from "./set-field.ts";

const contract = {
  formId: "f",
  title: "T",
  steps: [
    {
      stepId: "s1",
      title: "S",
      elements: [
        {
          fieldId: "first-name",
          label: "First name",
          htmlType: "text",
          validations: { required: {} },
        },
        {
          fieldId: "parish",
          label: "Parish",
          htmlType: "select",
          options: [
            { label: "St. Michael", value: "st-michael" },
            { label: "Christ Church", value: "christ-church" },
          ],
        },
      ],
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: "1.0.0",
} as unknown as ServiceContract;

const getDef = (async () => contract) as never;

test("records a valid value", async () => {
  assert.deepEqual(await applySetField("f", "first-name", "Jane", getDef), {
    ok: true,
    fieldId: "first-name",
    value: "Jane",
  });
});

test("rejects an invalid value with errors (echoes the attempted value)", async () => {
  const r = await applySetField("f", "first-name", "", getDef);
  assert.equal(r.ok, false);
  assert.equal(r.fieldId, "first-name");
  assert.equal(r.value, "");
  assert.ok(r.errors && r.errors.length > 0);
});

test("maps a choice LABEL to its option VALUE (pill click)", async () => {
  const r = await applySetField("f", "parish", "St. Michael", getDef);
  assert.equal(r.ok, true);
  assert.equal(r.value, "st-michael"); // resolved label → value
});

test("accepts a choice VALUE passed directly", async () => {
  const r = await applySetField("f", "parish", "christ-church", getDef);
  assert.equal(r.ok, true);
  assert.equal(r.value, "christ-church");
});

test("rejects an unknown fieldId", async () => {
  const r = await applySetField("f", "nope", "x", getDef);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ["unknown field: nope"]);
});

test("reports unavailable when the contract can't be loaded", async () => {
  const r = await applySetField(
    "f",
    "first-name",
    "Jane",
    (async () => null) as never,
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ["form is unavailable"]);
});
