import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categoriesFrom,
  categoryProblems,
  categoryRows,
  deleteBlocker,
  movedOrder,
  categorySlug,
  withServiceCounts,
  type Category,
  type CategoryFields,
} from "./categories";
import { ApiFailure, createEditorApi } from "./client";

const taxonomy = [
  { id: "education", parent_id: null, slug: "education", url: "/education", title: "Education" },
  { id: "health", parent_id: null, slug: "health", url: "/health", title: "Health" },
  {
    id: "youth",
    parent_id: null,
    slug: "youth-and-community",
    url: "/youth-and-community",
    title: "Youth and community",
  },
  {
    id: "sport",
    parent_id: "youth",
    slug: "sport",
    url: "/youth-and-community/sport",
    title: "Sport",
  },
  { id: "arts", parent_id: "youth", slug: "arts", url: "/youth-and-community/arts", title: "Arts" },
];

const services = [
  { category: { slug: "education", title: "Education" } },
  { category: { slug: "education", title: "Education" } },
  { category: { slug: "sport", title: "Sport" } },
];

const slugs = new Map(taxonomy.map((entry) => [entry.slug, entry.id]));

const categories = withServiceCounts(categoriesFrom(taxonomy), services, slugs);

const fields = (changes: Partial<CategoryFields> = {}): CategoryFields => ({
  title: "Housing",
  slug: "housing",
  parent_id: null,
  description: "",
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

  it("counts each category's services and keeps the API's order among siblings", () => {
    expect(categories.map((item) => [item.id, item.position, item.services])).toEqual([
      ["education", 0, 2],
      ["health", 1, 0],
      ["youth", 2, 0],
      ["sport", 0, 1],
      ["arts", 1, 0],
    ]);
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

describe("categories kept in memory until the content API can change them", () => {
  const fetches = vi.fn<(path: string) => Response>((path) =>
    path === "/taxonomy"
      ? Response.json({ categories: taxonomy })
      : path === "/services"
        ? Response.json(services)
        : new Response(null, { status: 404 }),
  );

  const editorApi = () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        fetches(new URL(input instanceof Request ? input.url : input).pathname),
      ),
    );

    return createEditorApi("https://api.example.test");
  };

  afterEach(() => {
    // Back to the original answers, and no calls
    fetches.mockReset();
    vi.unstubAllGlobals();
  });

  async function failureOf(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      if (error instanceof ApiFailure) return error;
    }

    return undefined;
  }

  it("reads the taxonomy once, and counts the services filed now on every read", async () => {
    const api = editorApi();
    const count = async (id: string) => byId(await api.categories(), id)?.services;

    expect((await api.categories()).map((item) => item.slug)).toEqual(
      taxonomy.map((item) => item.slug),
    );
    expect(await count("health")).toBe(0);

    // A service filed under Health since: counted, and Health can no longer be deleted
    const filed = [...services, { category: { slug: "health", title: "Health" } }];

    fetches.mockImplementation((path) =>
      path === "/taxonomy" ? Response.json({ categories: taxonomy }) : Response.json(filed),
    );
    expect(await count("health")).toBe(1);
    expect((await failureOf(api.deleteCategory("health")))?.status).toBe(409);
    expect(fetches.mock.calls.filter(([path]) => path === "/taxonomy")).toHaveLength(1);

    // A new slug keeps the services filed under the old one
    await api.updateCategory("education", fields({ title: "Schools", slug: "schools" }));
    expect(await count("education")).toBe(2);
  });

  it("keeps an addition made while the initial service count is loading", async () => {
    const started = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<void>();

    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;

      if (path === "/taxonomy") return Response.json({ categories: taxonomy });
      started.resolve();
      await pending.promise;

      return Response.json(services);
    });

    const api = createEditorApi("https://api.example.test");
    const reading = api.categories();

    await started.promise;
    const added = await api.createCategory(fields());

    pending.resolve();
    expect(await reading).toContainEqual(added);
  });

  it("asks again after a failed first read", async () => {
    const api = editorApi();

    fetches.mockImplementationOnce(() => new Response(null, { status: 503 }));
    expect((await failureOf(api.categories()))?.status).toBe(503);
    expect(await api.categories()).toHaveLength(5);
  });

  it("adds a category after its siblings, and refuses one the API would refuse", async () => {
    const api = editorApi();

    const added = await api.createCategory(
      fields({ title: " Dance ", slug: "dance", parent_id: "youth" }),
    );

    expect(added).toMatchObject({
      title: "Dance",
      url: "/youth-and-community/dance",
      position: 2,
      services: 0,
    });

    const refused = await failureOf(api.createCategory(fields({ slug: "dance" })));

    expect(refused?.status).toBe(422);
    expect(refused?.errors).toEqual([
      { field: "slug", message: "Another category already uses this slug" },
    ]);
  });

  it("moves a renamed parent's subcategories to its new address", async () => {
    const api = editorApi();

    await api.updateCategory(
      "youth",
      fields({ title: "Youth", slug: "youth", description: "Clubs and sport" }),
    );

    const list = await api.categories();

    expect(byId(list, "youth")).toMatchObject({ url: "/youth", description: "Clubs and sport" });
    expect(byId(list, "sport")?.url).toBe("/youth/sport");
  });

  it("puts a category moved under another parent at the end of its new siblings", async () => {
    const api = editorApi();

    await api.updateCategory(
      "health",
      fields({ title: "Health", slug: "health", parent_id: "youth" }),
    );

    expect(byId(await api.categories(), "health")).toMatchObject({
      parent_id: "youth",
      url: "/youth-and-community/health",
      position: 2,
    });
  });

  it("applies rapid moves to the current local order, within each sibling group", async () => {
    const api = editorApi();

    await api.categories();
    await Promise.all([
      api.moveCategory("youth", -1),
      api.moveCategory("youth", -1),
      api.moveCategory("arts", -1),
    ]);
    expect(categoryRows(await api.categories()).map((row) => row.id)).toEqual([
      "youth",
      "arts",
      "sport",
      "education",
      "health",
    ]);
  });

  it("keeps preview categories out of real taxonomy and resets them on a fresh page load", async () => {
    const api = editorApi();

    await api.createCategory(fields());
    expect((await api.categories()).some((category) => category.slug === "housing")).toBe(true);
    expect((await api.taxonomy()).some((category) => category.slug === "housing")).toBe(false);
    expect((await editorApi().categories()).some((category) => category.slug === "housing")).toBe(
      false,
    );
  });

  it("deletes a category nothing is filed under, and refuses one still in use", async () => {
    const api = editorApi();

    expect((await failureOf(api.deleteCategory("education")))?.status).toBe(409);
    expect((await failureOf(api.deleteCategory("youth")))?.status).toBe(409);
    await api.deleteCategory("health");
    expect(byId(await api.categories(), "health")).toBeUndefined();
    expect((await failureOf(api.deleteCategory("health")))?.status).toBe(404);
  });
});
