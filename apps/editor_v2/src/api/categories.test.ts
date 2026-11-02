import { describe, expect, it } from "vitest";
import {
  addressLock,
  categoryLabel,
  categoryProblems,
  categoryRows,
  deleteBlocker,
  holdsFields,
  inOrder,
  movedOrder,
  moveOrder,
  categorySlug,
  withSavedCategories,
  type Category,
  type CategoryFields,
} from "./categories";

const category = (
  id: string,
  title: string,
  position: number,
  services: number,
  parent?: Category,
): Category => {
  const slug = id === "youth" ? "youth-and-community" : id;

  return {
    id,
    parent_id: parent?.id ?? null,
    title,
    slug,
    description: null,
    url: parent ? `${parent.url}/${slug}` : `/${slug}`,
    position,
    services,
    reserved_route: false,
    last_edited_by: null,
    updated_at: "2026-10-26T12:00:00.000Z",
  };
};

const youth = category("youth", "Youth and community", 2, 0);

const categories: Category[] = [
  category("education", "Education", 0, 2),
  category("health", "Health", 1, 0),
  youth,
  category("sport", "Sport", 0, 1, youth),
  category("arts", "Arts", 1, 0, youth),
];

const fields = (changes: Partial<CategoryFields> = {}): CategoryFields => ({
  title: "Housing",
  slug: "housing",
  parent_id: null,
  description: null,
  ...changes,
});

const byId = (list: readonly Category[], id: string) => list.find((item) => item.id === id);

describe("category rules", () => {
  it("makes a slug of lower-case words joined by hyphens, accents dropped", () => {
    expect(categorySlug("Business & trade")).toBe("business-trade");
    expect(categorySlug("  Écoles   publiques! ")).toBe("ecoles-publiques");
    expect(categorySlug("--")).toBe("");

    const long = categorySlug("Word ".repeat(40));

    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith("-")).toBe(false);
  });

  it("lists each top-level category with its subcategories straight after it", () => {
    expect(
      categoryRows(categories).map((row) => [row.title, row.depth, row.place, row.siblings]),
    ).toEqual([
      ["Education", 0, 1, 3],
      ["Health", 0, 2, 3],
      ["Youth and community", 0, 3, 3],
      ["Sport", 1, 1, 2],
      ["Arts", 1, 2, 2],
    ]);
  });

  it("moves a category among its own siblings only, and nowhere past either end", () => {
    expect(movedOrder(categories, "health", -1)).toEqual(["health", "education", "youth"]);
    expect(movedOrder(categories, "health", 1)).toEqual(["education", "youth", "health"]);
    expect(movedOrder(categories, "education", -1)).toEqual(["education", "health", "youth"]);
    expect(movedOrder(categories, "arts", -1)).toEqual(["arts", "sport"]);
    expect(movedOrder(categories, "arts", 1)).toEqual(["sport", "arts"]);
  });

  it("says what's wrong with a category's fields, and nothing when they can be saved", () => {
    const problems = (changes: Partial<CategoryFields>, id?: string) =>
      categoryProblems(fields(changes), categories, id).map((problem) => problem.field);

    expect(problems({})).toEqual([]);
    expect(problems({ title: "  " })).toEqual(["title"]);
    expect(problems({ title: "x".repeat(201) })).toEqual(["title"]);
    expect(problems({ slug: "" })).toEqual(["slug"]);
    expect(problems({ slug: "Housing Help" })).toEqual(["slug"]);
    expect(problems({ slug: "housing--help" })).toEqual(["slug"]);
    expect(problems({ slug: "health" })).toEqual(["slug"]);
    // Its own slug is free for it to keep
    expect(problems({ slug: "health" }, "health")).toEqual([]);
    expect(problems({ parent_id: "missing" })).toEqual(["parent_id"]);
    // Two levels at most: a subcategory can't be a parent, and a parent can't become a subcategory
    expect(problems({ parent_id: "sport" })).toEqual(["parent_id"]);
    expect(problems({ slug: "youth-and-community", parent_id: "health" }, "youth")).toEqual([
      "parent_id",
    ]);
    expect(problems({ parent_id: "youth" })).toEqual([]);
  });

  it("saves a move with every sibling's version, and none at either end", () => {
    expect(moveOrder(categories, "health", -1)).toEqual({
      parent_id: null,
      expected: ["education", "health", "youth"].map((sibling) => ({
        id: sibling,
        updated_at: "2026-10-26T12:00:00.000Z",
      })),
      ordered_ids: ["health", "education", "youth"],
    });
    expect(moveOrder(categories, "arts", -1)?.ordered_ids).toEqual(["arts", "sport"]);
    expect(moveOrder(categories, "education", -1)).toBeUndefined();
    expect(moveOrder(categories, "arts", 1)).toBeUndefined();
    expect(moveOrder(categories, "missing", 1)).toBeUndefined();
  });

  it("every move of every sibling is a permutation its group can be checked against", () => {
    for (const sibling of categories)
      for (const by of [-1, 1] as const) {
        const order = moveOrder(categories, sibling.id, by);

        if (!order) continue;
        const group = categories.filter((item) => item.parent_id === sibling.parent_id);

        expect(order.ordered_ids.toSorted()).toEqual(group.map((item) => item.id).toSorted());
        expect(inOrder(categories, order)).toBe(false);

        const saved = order.ordered_ids.map((orderedId, position) => ({
          ...categories.find((item) => item.id === orderedId)!,
          position,
        }));

        expect(inOrder(withSavedCategories(categories, saved), order)).toBe(true);
      }
  });

  it("recognises a save the content API kept, trimmed and with a blank description as none", () => {
    const health = byId(categories, "health")!;

    expect(
      holdsFields(health, { title: " Health ", slug: "health", parent_id: null, description: " " }),
    ).toBe(true);
    expect(
      holdsFields(health, { title: "Health", slug: "health", parent_id: null, description: "x" }),
    ).toBe(false);
    expect(holdsFields(health, { ...fields(), title: "Health", slug: "healthy" })).toBe(false);
  });

  it("names a category by its address too only when another shares its name", () => {
    const twin = { ...byId(categories, "arts")!, id: "twin", parent_id: null, url: "/arts" };

    expect(categoryLabel(byId(categories, "arts")!, categories)).toBe("Arts");
    expect(categoryLabel(twin, [...categories, twin])).toBe("Arts (/arts)");
    expect(categoryLabel(byId(categories, "arts")!, [...categories, twin])).toBe(
      "Arts (/youth-and-community/arts)",
    );
  });

  it("locks an address that services, subcategories or an app route depend on", () => {
    expect(addressLock(byId(categories, "education")!, categories)).toMatch(/Services/);
    expect(addressLock(byId(categories, "youth")!, categories)).toMatch(/subcategories/);
    expect(addressLock(byId(categories, "health")!, categories)).toBeUndefined();
    expect(
      addressLock({ ...byId(categories, "health")!, reserved_route: true }, categories),
    ).toMatch(/site’s own/);
    expect(
      deleteBlocker({ ...byId(categories, "health")!, reserved_route: true }, categories),
    ).toMatch(/site’s own is at \/health/);
  });

  it("refuses to delete a category while services or subcategories are filed under it", () => {
    expect(deleteBlocker(byId(categories, "education")!, categories)).toBe(
      "2 services are filed under Education. Move them to another category first.",
    );
    expect(deleteBlocker(byId(categories, "sport")!, categories)).toBe(
      "1 service is filed under Sport. Move it to another category first.",
    );
    expect(deleteBlocker(byId(categories, "youth")!, categories)).toMatch(/has subcategories/);
    expect(deleteBlocker(byId(categories, "health")!, categories)).toBeUndefined();
  });
});
