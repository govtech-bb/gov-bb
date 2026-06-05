import { VALIDATION_RULE_DESCRIPTORS } from "./validation-builder";
import type { ValidationRuleDescriptor } from "./validation-builder";
import type { ValidationType } from "@govtech-bb/form-types";

function findRule(
  descriptors: ValidationRuleDescriptor[],
  type: ValidationType,
): ValidationRuleDescriptor | undefined {
  return descriptors.find((d) => d.type === type);
}

describe("VALIDATION_RULE_DESCRIPTORS.text", () => {
  const text = VALIDATION_RULE_DESCRIPTORS.text;

  it("still offers the pre-existing text rules", () => {
    const types = text.map((d) => d.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "required",
        "minLength",
        "maxLength",
        "pattern",
        "equal",
        "notEqual",
      ]),
    );
  });

  it.each([
    ["min", "Min Value", true, false],
    ["max", "Max Value", true, false],
    ["gt", "Greater Than", true, true],
    ["lt", "Less Than", true, true],
    ["minYear", "Min Year", true, false],
    ["maxYear", "Max Year", true, false],
  ] as const)(
    "offers %s with the same shape as number/date",
    (type, label, hasValue, hasReference) => {
      const rule = findRule(text, type);
      expect(rule).toBeDefined();
      expect(rule).toMatchObject({ type, label, hasValue, hasReference });
    },
  );

  it("mirrors the number entry's min/max/gt/lt descriptors exactly", () => {
    const number = VALIDATION_RULE_DESCRIPTORS.number;
    for (const type of ["min", "max", "gt", "lt"] as const) {
      expect(findRule(text, type)).toEqual(findRule(number, type));
    }
  });

  it("mirrors the date entry's minYear/maxYear descriptors exactly", () => {
    const date = VALIDATION_RULE_DESCRIPTORS.date;
    for (const type of ["minYear", "maxYear"] as const) {
      expect(findRule(text, type)).toEqual(findRule(date, type));
    }
  });
});

describe("VALIDATION_RULE_DESCRIPTORS scope guard", () => {
  it("does not extend textarea with numeric/year rules", () => {
    const types = VALIDATION_RULE_DESCRIPTORS.textarea.map((d) => d.type);
    expect(types).not.toContain("gt");
    expect(types).not.toContain("min");
    expect(types).not.toContain("minYear");
  });
});
