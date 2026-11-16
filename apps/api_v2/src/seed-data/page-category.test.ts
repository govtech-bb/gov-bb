import { describe, expect, it } from "vitest";
import { pageCategory } from "./page-category";

describe("pageCategory", () => {
  it("reads the category from `categories` or `category`", () => {
    expect(pageCategory("a", { categories: ["work-employment"] })).toBe(
      "work-employment",
    );
    expect(pageCategory("a", { category: "work-employment" })).toBe(
      "work-employment",
    );
  });

  it("accepts the same category named in both fields", () => {
    expect(
      pageCategory("a", {
        category: "work-employment",
        categories: ["work-employment"],
      }),
    ).toBe("work-employment");
  });

  it("returns undefined for a page that names none", () => {
    expect(pageCategory("a", {})).toBeUndefined();
  });

  it("fails on a page that names two categories, naming the page and both", () => {
    expect(() =>
      pageCategory("calculate-severance-pay", {
        categories: ["money-financial-support", "work-employment"],
      }),
    ).toThrow(
      "calculate-severance-pay names 2 categories (money-financial-support, work-employment)",
    );
  });
});
