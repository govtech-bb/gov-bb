import { describe, expect, it } from "vitest";
import { formCategory } from "./form-category";

describe("formCategory", () => {
  it("returns a slug string for any form id (fallback for unknown)", () => {
    expect(typeof formCategory("totally-unknown-form")).toBe("string");
    expect(formCategory("totally-unknown-form")).toBe("uncategorised");
  });
});
