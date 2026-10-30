import { describe, expect, it } from "vitest";
import { pageCategory, type CategoryRecord } from "./navigation";

const row = (id: string, parentId: string | null = null): CategoryRecord => ({
  id,
  slug: `${id}-slug`,
  title: `${id} title`,
  description: null,
  parentId,
});

const categories = [row("youth"), row("arts", "youth"), row("money")];

describe("pageCategory", () => {
  it("is unfiled when the page has no category", () => {
    expect(pageCategory(null, categories)).toEqual({
      category: null,
      subcategory: null,
      crumbs: [],
    });
  });

  it("names a top-level category and no subcategory", () => {
    expect(pageCategory("money", categories)).toEqual({
      category: "money-slug",
      subcategory: null,
      crumbs: [{ name: "money title", url: "/money-slug" }],
    });
  });

  it("names the parent as the category and the row as the subcategory", () => {
    expect(pageCategory("arts", categories)).toEqual({
      category: "youth-slug",
      subcategory: "arts-slug",
      crumbs: [
        { name: "youth title", url: "/youth-slug" },
        { name: "arts title", url: "/youth-slug/arts-slug" },
      ],
    });
  });
});
