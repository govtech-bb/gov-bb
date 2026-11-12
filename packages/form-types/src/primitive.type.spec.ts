import { describe, it, expect } from "vitest";
import {
  primitiveSchema,
  fieldOverridesSchema,
  contentVariantSchema,
} from "./primitive.type";

describe("content primitive", () => {
  it("parses a content element with variant + body", () => {
    const parsed = primitiveSchema.parse({
      fieldId: "officer-notice",
      label: "Information",
      htmlType: "content",
      variant: "inset",
      content: "As the event organiser, you must request an officer.",
    });
    expect(parsed.htmlType).toBe("content");
  });

  it("rejects a content element missing content/variant", () => {
    expect(() =>
      primitiveSchema.parse({
        fieldId: "officer-notice",
        label: "Information",
        htmlType: "content",
      }),
    ).toThrow();
  });

  it("accepts a summary for the details variant", () => {
    expect(contentVariantSchema.parse("details")).toBe("details");
  });

  it("accepts the warning variant", () => {
    expect(contentVariantSchema.parse("warning")).toBe("warning");
  });

  it("keeps content/variant/summary through field overrides", () => {
    const o = fieldOverridesSchema.parse({
      content: "body",
      variant: "details",
      summary: "Why you do not choose officer times",
    });
    expect(o).toEqual({
      content: "body",
      variant: "details",
      summary: "Why you do not choose officer times",
    });
  });

  it("still strips unknown override keys", () => {
    const o = fieldOverridesSchema.parse({ bogus: "x", content: "body" });
    expect(o).toEqual({ content: "body" });
  });
});

describe("ui.prefix", () => {
  it("parses a field with a ui.prefix", () => {
    const parsed = primitiveSchema.parse({
      fieldId: "monthly-rent",
      label: "Monthly rent",
      htmlType: "number",
      ui: { prefix: "BDS $", width: "short" },
    });
    expect(parsed.ui).toEqual({ prefix: "BDS $", width: "short" });
  });

  it("rejects a non-string ui.prefix", () => {
    expect(
      primitiveSchema.safeParse({
        fieldId: "monthly-rent",
        label: "Monthly rent",
        htmlType: "number",
        ui: { prefix: 1 },
      }).success,
    ).toBe(false);
  });

  it("keeps ui.prefix through field overrides", () => {
    const o = fieldOverridesSchema.parse({ ui: { prefix: "BDS $" } });
    expect(o).toEqual({ ui: { prefix: "BDS $" } });
  });
});
