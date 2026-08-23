import { validationRuleSchema } from "./validation.type";

// #2384: `validationConfigSchema.value` is `z.any()` — one loose shape shared
// by every rule type — so a builder-authored comma string sailed through the
// recipe schema as `fileTypes.value` and reached the forms renderer, where
// `rawFileTypes.map(...)` threw "map is not a function" and the error boundary
// swallowed the whole step. These pin the per-rule value contracts declared in
// validation-rules.type.ts so an off-shape value fails at the schema boundary
// (CI `validate-recipes`, the API recipe loader, and the builder's draft save)
// instead of at render time.
describe("validationRuleSchema per-rule value shapes (#2384)", () => {
  describe("fileTypes", () => {
    it("accepts an array of strings", () => {
      expect(
        validationRuleSchema.safeParse({
          fileTypes: { value: ["application/pdf", "image/png"] },
        }).success,
      ).toBe(true);
    });

    it("rejects a comma-separated string (the crash that shipped)", () => {
      expect(
        validationRuleSchema.safeParse({
          fileTypes: { value: "application/pdf,image/jpeg,image/png" },
        }).success,
      ).toBe(false);
    });
  });

  describe("numeric rules", () => {
    it.each([
      "itemMaxSize",
      "maxSize",
      "minItems",
      "maxItems",
      "minLength",
      "maxLength",
    ])("accepts a number for %s", (rule) => {
      expect(
        validationRuleSchema.safeParse({ [rule]: { value: 5242880 } }).success,
      ).toBe(true);
    });

    it.each([
      "itemMaxSize",
      "maxSize",
      "minItems",
      "maxItems",
      "minLength",
      "maxLength",
    ])("rejects a numeric string for %s", (rule) => {
      expect(
        validationRuleSchema.safeParse({ [rule]: { value: "5242880" } })
          .success,
      ).toBe(false);
    });

    it.each(["gt", "lt"])("rejects a numeric string for %s", (rule) => {
      expect(
        validationRuleSchema.safeParse({ [rule]: { value: "15" } }).success,
      ).toBe(false);
    });

    it.each(["gt", "lt"])(
      "still accepts %s with no value (reference-field form)",
      (rule) => {
        expect(
          validationRuleSchema.safeParse({
            [rule]: { referenceFieldId: "other-field" },
          }).success,
        ).toBe(true);
      },
    );
  });

  describe("required", () => {
    it("accepts a boolean", () => {
      expect(
        validationRuleSchema.safeParse({ required: { value: true } }).success,
      ).toBe(true);
    });

    it('rejects the string "true"', () => {
      expect(
        validationRuleSchema.safeParse({ required: { value: "true" } }).success,
      ).toBe(false);
    });
  });

  describe("rules left deliberately loose", () => {
    it("accepts a string pattern", () => {
      expect(
        validationRuleSchema.safeParse({ pattern: { value: "^[0-9]+$" } })
          .success,
      ).toBe(true);
    });

    it("accepts an equal rule with a string value", () => {
      expect(
        validationRuleSchema.safeParse({ equal: { value: "yes" } }).success,
      ).toBe(true);
    });

    it("accepts a rule carrying only an error message", () => {
      expect(
        validationRuleSchema.safeParse({ required: { error: "Required" } })
          .success,
      ).toBe(true);
    });
  });
});
