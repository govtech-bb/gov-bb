import { describe, expect, it } from "vitest";
import { formCategory, rememberFormCategory } from "./form-category";

describe("formCategory", () => {
  it("falls back to uncategorised for a form with no known category", () => {
    expect(formCategory("totally-unknown-form")).toBe("uncategorised");
  });

  it("returns the category the API contract carried for the form (#3250)", () => {
    rememberFormCategory("form-with-category", "education");
    expect(formCategory("form-with-category")).toBe("education");
  });

  it("keeps the fallback when the contract carried no category", () => {
    rememberFormCategory("form-without-category", undefined);
    expect(formCategory("form-without-category")).toBe("uncategorised");
  });
});
