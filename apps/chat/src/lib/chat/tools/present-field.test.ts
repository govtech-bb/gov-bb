import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceContract } from "@govtech-bb/form-types";
import { presentField } from "./present-field.ts";

const contract = {
  formId: "f",
  title: "T",
  steps: [
    {
      stepId: "s1",
      title: "S",
      elements: [
        {
          fieldId: "parish",
          label: "Parish",
          htmlType: "select",
          hint: "Where you live",
          validations: { required: {} },
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

test("presents a field's label, hint, required, and option pills", async () => {
  const f = await presentField("f", "parish", getDef);
  assert.equal(f.found, true);
  assert.equal(f.label, "Parish");
  assert.equal(f.htmlType, "select");
  assert.equal(f.required, true);
  assert.equal(f.hint, "Where you live");
  assert.deepEqual(f.options, [
    { label: "St. Michael", value: "st-michael" },
    { label: "Christ Church", value: "christ-church" },
  ]);
});

test("found:false for an unknown field", async () => {
  assert.deepEqual(await presentField("f", "nope", getDef), {
    found: false,
    fieldId: "nope",
  });
});
