import { describe, expect, it } from "vitest";
import {
  catalogOf,
  pageCategory,
  type CategoryRecord,
  type ListablePage,
} from "./navigation";
import type { PageId } from "./page";

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

describe("catalogOf", () => {
  const page = (
    id: string,
    overrides: Partial<ListablePage> = {},
  ): ListablePage => ({
    id: id as PageId,
    parentId: null,
    slug: id,
    url: `/${id}`,
    title: id,
    description: null,
    formId: null,
    frontmatter: {},
    categoryId: "money",
    visibility: "public",
    ...overrides,
  });

  const formIds = (pages: ListablePage[]) =>
    Object.fromEntries(
      catalogOf(pages, categories).map((entry) => [entry.url, entry.form_id]),
    );

  it("takes the form from the page's own start step, not another child's", () => {
    expect(
      formIds([
        page("grant"),
        page("grant-help", { parentId: "grant" as PageId, formId: "help" }),
        page("grant-start", {
          parentId: "grant" as PageId,
          slug: "start",
          formId: "grant-form",
        }),
      ]),
    ).toEqual({ "/grant": "grant-form", "/grant-help": "help" });
  });

  it("gives no form when the start step is not among the visible pages", () => {
    expect(formIds([page("grant")])).toEqual({ "/grant": null });
  });

  it("leaves an uncategorised page without a category", () => {
    const [entry] = catalogOf(
      [page("terms", { categoryId: null })],
      categories,
    );
    expect(entry).toMatchObject({ category: null, subcategory: null });
  });
});
