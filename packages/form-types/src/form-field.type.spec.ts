import { primitiveSchema } from "./primitive.type";
import { fieldConditionalOnBehaviourSchema } from "./behavior.type";

const base = { fieldId: "my-field", label: "My Field" };
const option = { label: "Yes", value: "yes" };

describe("primitiveSchema", () => {
  describe("simple variants (no extra required fields)", () => {
    const simpleTypes = [
      "text",
      "textarea",
      "date",
      "number",
      "tel",
      "email",
      "show-hide",
    ] as const;

    it.each(simpleTypes)("accepts a valid %s field", (htmlType) => {
      expect(primitiveSchema.safeParse({ ...base, htmlType }).success).toBe(
        true,
      );
    });
  });

  describe("checkbox", () => {
    it("accepts valid checkbox with options", () => {
      expect(
        primitiveSchema.safeParse({
          ...base,
          htmlType: "checkbox",
          options: [option],
        }).success,
      ).toBe(true);
    });

    it("rejects checkbox missing options", () => {
      expect(
        primitiveSchema.safeParse({ ...base, htmlType: "checkbox" }).success,
      ).toBe(false);
    });
  });

  describe("radio", () => {
    it("accepts valid radio with options", () => {
      expect(
        primitiveSchema.safeParse({
          ...base,
          htmlType: "radio",
          options: [option],
        }).success,
      ).toBe(true);
    });

    it("rejects radio missing options", () => {
      expect(
        primitiveSchema.safeParse({ ...base, htmlType: "radio" }).success,
      ).toBe(false);
    });
  });

  describe("select", () => {
    it("accepts valid select with options and multiple", () => {
      expect(
        primitiveSchema.safeParse({
          ...base,
          htmlType: "select",
          options: [option],
          multiple: false,
        }).success,
      ).toBe(true);
    });

    it("rejects select missing options", () => {
      expect(
        primitiveSchema.safeParse({
          ...base,
          htmlType: "select",
          multiple: false,
        }).success,
      ).toBe(false);
    });

    it("rejects select missing multiple", () => {
      expect(
        primitiveSchema.safeParse({
          ...base,
          htmlType: "select",
          options: [option],
        }).success,
      ).toBe(false);
    });
  });

  describe("file", () => {
    it("accepts valid file with multiple", () => {
      expect(
        primitiveSchema.safeParse({
          ...base,
          htmlType: "file",
          multiple: true,
        }).success,
      ).toBe(true);
    });

    it("rejects file missing multiple", () => {
      expect(
        primitiveSchema.safeParse({ ...base, htmlType: "file" }).success,
      ).toBe(false);
    });
  });

  describe("common rejections", () => {
    it("rejects missing fieldId", () => {
      const { fieldId: _f, ...noFieldId } = { ...base, htmlType: "text" };
      expect(primitiveSchema.safeParse(noFieldId).success).toBe(false);
    });

    it("rejects missing label", () => {
      const { label: _l, ...noLabel } = { ...base, htmlType: "text" };
      expect(primitiveSchema.safeParse(noLabel).success).toBe(false);
    });

    it("rejects unknown htmlType", () => {
      expect(
        primitiveSchema.safeParse({ ...base, htmlType: "rich-text" }).success,
      ).toBe(false);
    });

    it("rejects missing htmlType", () => {
      expect(primitiveSchema.safeParse(base).success).toBe(false);
    });
  });
});

describe("fieldConditionalOnBehaviourSchema", () => {
  const baseConditional = {
    type: "fieldConditionalOn" as const,
    targetFieldId: "target-field",
    operator: "equal" as const,
    value: "test-value",
  };

  describe("operators", () => {
    it("accepts notEqual operator", () => {
      expect(
        fieldConditionalOnBehaviourSchema.safeParse({
          ...baseConditional,
          operator: "notEqual",
        }).success,
      ).toBe(true);
    });

    it("accepts in operator", () => {
      expect(
        fieldConditionalOnBehaviourSchema.safeParse({
          ...baseConditional,
          operator: "in",
          value: ["value1", "value2"],
        }).success,
      ).toBe(true);
    });

    it("accepts exists operator", () => {
      expect(
        fieldConditionalOnBehaviourSchema.safeParse({
          ...baseConditional,
          operator: "exists",
          value: true,
        }).success,
      ).toBe(true);
    });

    it("rejects missing operator", () => {
      const { operator: _o, ...noOperator } = baseConditional;
      expect(
        fieldConditionalOnBehaviourSchema.safeParse(noOperator).success,
      ).toBe(false);
    });
  });
});
