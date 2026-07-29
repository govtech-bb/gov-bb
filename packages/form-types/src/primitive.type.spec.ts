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
