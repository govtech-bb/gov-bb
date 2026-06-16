import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceContract } from "@govtech-bb/form-types";
import { activeFieldIds, optionalFieldIds } from "./conditions.ts";
import { extractFields } from "./fields.ts";

// employer-name is revealed only when employed === "yes".
const contract = {
  formId: "f",
  title: "T",
  version: "1.0.0",
  steps: [
    {
      stepId: "s1",
      title: "S",
      elements: [
        {
          fieldId: "employed",
          label: "Are you employed?",
          htmlType: "radio",
          options: [
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" },
          ],
        },
        {
          fieldId: "employer-name",
          label: "Employer name",
          htmlType: "text",
          behaviours: [
            {
              type: "fieldConditionalOn",
              targetFieldId: "employed",
              operator: "equal",
              value: "yes",
            },
          ],
        },
      ],
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as ServiceContract;

test("a conditional field is inactive until its trigger value is set", () => {
  assert.equal(activeFieldIds(contract, {}).has("employer-name"), false);
  assert.equal(
    activeFieldIds(contract, { employed: "yes" }).has("employer-name"),
    true,
  );
  assert.equal(
    activeFieldIds(contract, { employed: "no" }).has("employer-name"),
    false,
  );
  assert.equal(activeFieldIds(contract, {}).has("employed"), true); // unconditional
});

// nid is normally required, but optionalIf use-passport === "yes" relaxes it.
const optionalContract = {
  formId: "f",
  title: "T",
  version: "1.0.0",
  steps: [
    {
      stepId: "s1",
      title: "S",
      elements: [
        {
          fieldId: "use-passport",
          label: "Use passport instead?",
          htmlType: "show-hide",
        },
        {
          fieldId: "nid",
          label: "National ID",
          htmlType: "text",
          validations: { required: {} },
          behaviours: [
            {
              type: "optionalIf",
              targetFieldId: "use-passport",
              operator: "equal",
              value: "true",
            },
          ],
        },
      ],
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as ServiceContract;

test("optionalFieldIds flags a field whose optionalIf currently matches", () => {
  assert.equal(optionalFieldIds(optionalContract, {}).has("nid"), false);
  assert.equal(
    optionalFieldIds(optionalContract, { "use-passport": "true" }).has("nid"),
    true,
  );
});

test("extractFields hides the conditional field until revealed", () => {
  assert.deepEqual(
    extractFields(contract, {}).map((f) => f.fieldId),
    ["employed"],
  );
  assert.deepEqual(
    extractFields(contract, { employed: "yes" }).map((f) => f.fieldId),
    ["employed", "employer-name"],
  );
});
