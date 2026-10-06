import { jsonSettings } from "../helpers/serialized-test-data";
import { dateField } from "../../src/forms/features/date/definition";
import { expect, test } from "vitest";
import { ageConditionError, conditionMode } from "../../src/forms/core/logic-age";
import { logicAgeIssues } from "../../src/forms/adapters/ssb/logic-age";
import { comparisons } from "../../src/forms/features/logic/comparisons";
import { conditionalLogic } from "../../src/forms/core/logic";
import { type Field } from "../../src/forms/features/logic/queries";
import type { Condition, FormSchema } from "../helpers/default-form";

import { logicIssues } from "../../src/forms/editor/capabilities";

const birth: Field = {
  key: "dob",
  type: "INPUT_FIELD",
  kind: "date",
  title: "Date of birth",
  capabilities: dateField.capabilities,
};

const adult: Extract<Condition, { type: "SINGLE" }> = {
  id: "adult",
  type: "SINGLE",
  field: "dob",
  comparison: "GREATER_OR_EQUAL_THAN",
  value: 18,
  transform: "yearsSince",
};

test("age mode uses numeric comparisons while ordinary dates keep their operators", () => {
  expect(comparisons(birth, "yearsSince")).toContain("GREATER_OR_EQUAL_THAN");
  expect(comparisons(birth, "yearsSince")).not.toContain("IS_BEFORE");
  expect(comparisons(birth)).toContain("IS_BEFORE");
  expect(
    conditionMode(
      { id: "a", type: "SINGLE", field: "dob", comparison: "IS", value: "2000-01-02" },
      true,
    ),
  ).toEqual({
    id: "a",
    type: "SINGLE",
    field: "dob",
    comparison: "GREATER_OR_EQUAL_THAN",
    value: "",
    transform: "yearsSince",
  });
  expect(conditionMode(adult, false)).toEqual({
    id: "adult",
    type: "SINGLE",
    field: "dob",
    comparison: "IS",
    value: "",
  });
});

test("AND and OR age conditions preserve thresholds and missing references for repair", () => {
  const missing = { ...adult, id: "missing", field: "deleted-date", value: 21 };

  const settings: ReturnType<typeof conditionalLogic> = {
    logicalOperator: "OR",
    conditionals: [
      { id: "group", type: "GROUP", logicalOperator: "AND", conditionals: [adult, missing] },
    ],
    actions: [],
  };

  const before = structuredClone(settings);
  const logic = conditionalLogic(jsonSettings(settings));
  expect(logic).toEqual(settings);

  const schema: FormSchema = {
    title: "Age test",
    formId: "age-test",
    processors: [],
    meta: { visibility: "public" },
    pages: [
      {
        id: "page",
        stepId: "page",
        pageType: "questions",
        confirmation: false,
        blocks: [
          {
            type: "question",
            id: "dob",
            fieldId: "dob",
            ref: "components/generic-date",
            kind: "date",
            title: "Date of birth",
            placeholder: "",
            options: [],
            description: [],
            settings: {},
            errors: {},
          },
          { type: "logic", id: "logic", ...logic },
        ],
      },
    ],
  };

  expect(logicAgeIssues(schema)).toEqual([
    { code: "logic-age", message: "Age in years needs a date answer", where: "logic" },
  ]);
  expect(logicIssues(schema)).toEqual([
    {
      code: "missing-reference",
      message: "Choose a field or block that still exists in this form.",
      where: "logic",
    },
  ]);
  expect(logic.conditionals).toEqual(before.conditionals);
  expect(settings).toEqual(before);
});

test("age conditions require a date and finite nonnegative whole-year literals", () => {
  expect(ageConditionError(adult, "date")).toBeUndefined();
  expect(ageConditionError({ ...adult, value: 0 }, "date")).toBeUndefined();

  for (const value of [-1, 18.5, Infinity, "18", { field: "other" }])
    expect(ageConditionError({ ...adult, value }, "date")).toBeDefined();
  expect(ageConditionError(adult, "text")).toBe("Age in years needs a date answer");
  expect(ageConditionError({ ...adult, comparison: "IS_BEFORE" }, "date")).toBeDefined();

  const schema: FormSchema = {
    title: "Age test",
    formId: "age-test",
    processors: [],
    meta: { visibility: "public" },
    pages: [
      {
        id: "page",
        stepId: "page",
        pageType: "questions",
        confirmation: false,
        blocks: [
          {
            type: "question",
            id: "dob",
            kind: "date",
            fieldId: "dob",
            ref: "components/generic-date",
            title: "Date of birth",
            placeholder: "",
            options: [],
            description: [],
            settings: {},
            errors: {},
          },
          {
            type: "logic",
            id: "logic",
            logicalOperator: "AND",
            actions: [],
            conditionals: [
              {
                id: "g",
                type: "GROUP",
                logicalOperator: "OR",
                conditionals: [{ ...adult, value: -2 }],
              },
            ],
          },
        ],
      },
    ],
  };

  expect(logicAgeIssues(schema)).toEqual([
    {
      code: "logic-age",
      message: "Enter an age as a whole number of years, zero or more",
      where: "logic",
    },
  ]);
});
