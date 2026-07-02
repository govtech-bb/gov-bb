import { describe, expect, it } from "vitest";
import { buildFormCategories } from "./build-form-categories";
import { FALLBACK_CATEGORY, categoryForForm } from "./form-categories";

describe("buildFormCategories", () => {
  it("maps form_id to the primary category slug", () => {
    const map = buildFormCategories([
      { form_id: "apply-for-conductor-licence", category: "work-employment" },
      {
        form_id: "nag",
        categories: ["social-empowerment", "money-financial-support"],
      },
    ]);
    expect(map).toEqual({
      "apply-for-conductor-licence": "work-employment",
      nag: "social-empowerment",
    });
  });

  it("prefers categories[0] over the singular category", () => {
    const map = buildFormCategories([
      { form_id: "x", category: "a", categories: ["b"] },
    ]);
    expect(map).toEqual({ x: "b" });
  });

  it("skips services with no form_id or no category", () => {
    const map = buildFormCategories([
      { category: "work-employment" },
      { form_id: "y" },
    ]);
    expect(map).toEqual({});
  });
});

describe("categoryForForm", () => {
  it("falls back to 'uncategorised' for an unknown form", () => {
    expect(categoryForForm("does-not-exist")).toBe(FALLBACK_CATEGORY);
    expect(FALLBACK_CATEGORY).toBe("uncategorised");
  });
});
