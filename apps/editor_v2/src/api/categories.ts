import { slugify } from "./slug";

// Category preview data and validation. These local rules are not a category-write API contract.

/** A category services are filed under, with its place among its siblings and how many services it holds. */
export type Category = {
  id: string;
  /** The category it's a subcategory of; null at the top level. */
  parent_id: string | null;
  slug: string;
  title: string;
  description: string;
  /** `/<category>`, or `/<category>/<subcategory>`. */
  url: string;
  /** Its place among the categories with the same parent: the lowest comes first. */
  position: number;
  /** The services filed directly under it. */
  services: number;
  /** The real API name used by Services filters, unchanged by preview edits. */
  serviceCategoryTitle: string;
};

/** What adding or editing a category sets. */
export type CategoryFields = Pick<Category, "title" | "slug" | "parent_id" | "description">;

/** A field that can't be saved, and why: the shape the content API refuses a change in. */
export type CategoryProblem = { field: keyof CategoryFields; message: string };

/** One row of the categories list: a category, how deep it sits, and where among its siblings. */
export type CategoryRow = Category & {
  depth: 0 | 1;
  /** From 1, among the categories with the same parent. */
  place: number;
  siblings: number;
};

// The content API's column sizes
const TITLE_MAX = 200;

const SLUG_MAX = 100;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FIELD_LABELS = new Map([
  ["title", "Name"],
  ["slug", "Slug"],
  ["parent_id", "Parent category"],
  ["description", "Description"],
]);

/** What a field the content API refused is called in the category dialog. */
export const categoryFieldLabel = (field: string) => FIELD_LABELS.get(field) ?? field;

/** A category's slug from its name, as a page's comes from its title. */
export const categorySlug = (name: string) => slugify(name, SLUG_MAX);

/** Its address on the site: under its parent's when it's a subcategory. */
export const categoryUrl = (slug: string, parent?: Pick<Category, "slug">) =>
  parent ? `/${parent.slug}/${slug}` : `/${slug}`;

/** The categories with one parent, or the top level's with null, in their order. */
export const siblingsOf = (categories: readonly Category[], parentId: string | null) =>
  categories
    .filter((category) => category.parent_id === parentId)
    .toSorted((a, b) => a.position - b.position || a.title.localeCompare(b.title));

/** Each top-level category in order, its subcategories in order straight after it. */
export function categoryRows(categories: readonly Category[]): CategoryRow[] {
  const rows = (parentId: string | null, depth: 0 | 1) => {
    const siblings = siblingsOf(categories, parentId);

    return siblings.map((category, index) => ({
      ...category,
      depth,
      place: index + 1,
      siblings: siblings.length,
    }));
  };

  return rows(null, 0).flatMap((row) => [row, ...rows(row.id, 1)]);
}

/** Its siblings' ids in their order once it moves a place up (-1) or down (1); unchanged at either end. */
export function movedOrder(categories: readonly Category[], id: string, by: -1 | 1) {
  const moving = categories.find((category) => category.id === id);
  const ids = moving ? siblingsOf(categories, moving.parent_id).map((category) => category.id) : [];
  const from = ids.indexOf(id);
  const to = from + by;

  if (from === -1 || to < 0 || to >= ids.length) return ids;

  return ids.toSpliced(from, 1).toSpliced(to, 0, id);
}

/** The categories with one group of siblings put in this order. */
export function reordered(categories: readonly Category[], ids: readonly string[]) {
  const positions = new Map(ids.map((id, position) => [id, position]));

  return categories.map((category) => {
    const position = positions.get(category.id);

    return position === undefined ? category : { ...category, position };
  });
}

/** What stops a category being added or saved with these fields; nothing when it can be. */
export function categoryProblems(
  fields: CategoryFields,
  categories: readonly Category[],
  id?: string,
): CategoryProblem[] {
  const problems: CategoryProblem[] = [];
  const title = fields.title.trim();
  const parent = categories.find((category) => category.id === fields.parent_id);

  if (!title) problems.push({ field: "title", message: "Enter a name" });
  else if (title.length > TITLE_MAX)
    problems.push({ field: "title", message: `Keep the name to ${TITLE_MAX} characters or fewer` });

  if (!fields.slug) problems.push({ field: "slug", message: "Enter a slug" });
  else if (fields.slug.length > SLUG_MAX)
    problems.push({ field: "slug", message: `Keep the slug to ${SLUG_MAX} characters or fewer` });
  else if (!SLUG.test(fields.slug))
    problems.push({
      field: "slug",
      message: "Use only lower-case letters, numbers and single hyphens between words",
    });
  else if (categories.some((category) => category.id !== id && category.slug === fields.slug))
    problems.push({ field: "slug", message: "Another category already uses this slug" });

  if (fields.parent_id) {
    if (!parent || parent.id === id)
      problems.push({ field: "parent_id", message: "Choose a parent from the list" });
    // Addresses go two levels deep at most: a category, then a subcategory
    else if (parent.parent_id)
      problems.push({ field: "parent_id", message: "Choose a top-level category as the parent" });
    else if (id && categories.some((category) => category.parent_id === id))
      problems.push({
        field: "parent_id",
        message: "It has subcategories of its own, so it stays at the top level",
      });
  }

  return problems;
}

/** Why a preview category cannot be deleted: services or subcategories still use it. */
export function deleteBlocker(category: Category, categories: readonly Category[]) {
  if (category.services === 1)
    return `1 service is filed under ${category.title}. Move it to another category first.`;

  if (category.services > 1)
    return `${category.services} services are filed under ${category.title}. Move them to another category first.`;

  if (categories.some((other) => other.parent_id === category.id))
    return `${category.title} has subcategories. Delete them, or move them to another category, first.`;

  return undefined;
}

/** The preview's categories from the saved ones, each in the order the API lists it among its siblings. */
export function categoriesFrom(
  saved: readonly Pick<Category, "id" | "parent_id" | "slug" | "url" | "title">[],
): Category[] {
  const places = new Map<string | null, number>();

  return saved.map((entry) => {
    const position = places.get(entry.parent_id) ?? 0;

    places.set(entry.parent_id, position + 1);

    return {
      id: entry.id,
      parent_id: entry.parent_id,
      slug: entry.slug,
      title: entry.title,
      serviceCategoryTitle: entry.title,
      description: "",
      url: entry.url,
      position,
      services: 0,
    };
  });
}

/**
 * Each category with the services filed directly under it now. A service names its category by slug: `ids` gives the
 * category each slug belonged to when the list was read, so a category whose slug has changed since keeps its services.
 */
export function withServiceCounts(
  categories: readonly Category[],
  services: readonly { category: { slug: string } }[],
  ids: ReadonlyMap<string, string>,
): Category[] {
  const counts = new Map<string, number>();

  for (const service of services) {
    const id = ids.get(service.category.slug);

    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return categories.map((category) => ({ ...category, services: counts.get(category.id) ?? 0 }));
}
