import type { paths } from "./openapi";
import { slugify } from "./slug";

// The one shared category list's rules, as the editor checks them before the content API does (ADR 0078).

type CategoryRoutes = paths["/editor/categories"];

/**
 * A category in the one shared list services are filed under, as `GET /editor/categories` reads it. `url` is
 * `/<category>` or `/<category>/<subcategory>`; `position` is its place among its siblings, lowest first; `services`
 * counts the services filed directly under it, drafts included; `reserved_route` means an app-owned route anchors its
 * address, so its slug and parent can't change and it can't be deleted; `updated_at` is its version, sent back to
 * change it.
 */
export type Category =
  CategoryRoutes["get"]["responses"][200]["content"]["application/json"]["categories"][number];

/** What adding or editing a category sets. A blank description is saved as none. */
export type CategoryFields = CategoryRoutes["post"]["requestBody"]["content"]["application/json"];

/** A sibling group's new order, with the versions of every sibling as they were read: all of it saves, or none. */
export type CategoryOrder =
  paths["/editor/categories/order"]["put"]["requestBody"]["content"]["application/json"];

/** What still uses a category the content API won't delete: pages of any status, subcategories, an app route. */
export type CategoryBlockers = Extract<
  paths["/editor/categories/{id}"]["delete"]["responses"][409]["content"]["application/json"],
  { error: "category_in_use" }
>["blockers"];

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

/** The categories with these, as the content API just saved them, in place of the versions read before. */
export function withSavedCategories(categories: readonly Category[], saved: readonly Category[]) {
  const byId = new Map(saved.map((category) => [category.id, category]));

  return categories.map((category) => byId.get(category.id) ?? category);
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

/**
 * How a category is named in a list of them: its name, or with its address too when another category shares the name,
 * such as two subcategories called Grants under different parents.
 */
export function categoryLabel(category: Category, categories: readonly Category[]) {
  const shared = categories.some(
    (other) => other.id !== category.id && other.title === category.title,
  );

  return shared ? `${category.title} (${category.url})` : category.title;
}

/**
 * Why a category's address, its slug and its parent, can't change now, or undefined when it can: an app route is
 * built on it, or something is filed under it. Its name, description and place among its siblings can still change.
 */
export function addressLock(category: Category, categories: readonly Category[]) {
  if (category.reserved_route)
    return "A page of the site's own is at this address, so it keeps its slug and parent.";

  if (category.services > 0) return "Services are filed under it, so it keeps its slug and parent.";

  if (categories.some((other) => other.parent_id === category.id))
    return "It has subcategories, so it keeps its slug and stays at the top level.";

  return undefined;
}

/**
 * The save that moves a category a place up (-1) or down (1) among its siblings: their new order, with every sibling's
 * version as read, so the content API refuses it if any of them has changed since. Undefined at either end.
 */
export function moveOrder(
  categories: readonly Category[],
  id: string,
  by: -1 | 1,
): CategoryOrder | undefined {
  const moving = categories.find((category) => category.id === id);

  if (!moving) return undefined;
  const siblings = siblingsOf(categories, moving.parent_id);
  const orderedIds = movedOrder(categories, id, by);

  if (orderedIds.every((sibling, index) => siblings[index]?.id === sibling)) return undefined;

  return {
    parent_id: moving.parent_id,
    expected: siblings.map((sibling) => ({ id: sibling.id, updated_at: sibling.updated_at })),
    ordered_ids: orderedIds,
  };
}

/** Whether a sibling group is in this order now, as when a move whose answer was lost is checked. */
export const inOrder = (categories: readonly Category[], order: CategoryOrder) =>
  siblingsOf(categories, order.parent_id)
    .map((category) => category.id)
    .join() === order.ordered_ids.join();

/** Whether a category now holds the fields a save sent, as the content API keeps them: trimmed, a blank description none. */
export const holdsFields = (category: Category, fields: CategoryFields) =>
  category.title === fields.title.trim() &&
  category.slug === fields.slug &&
  category.parent_id === fields.parent_id &&
  category.description === (fields.description?.trim() || null);

/** Why a category cannot be deleted: services, subcategories or an app route still use it. */
export function deleteBlocker(category: Category, categories: readonly Category[]) {
  if (category.reserved_route)
    return `A page of the site's own is at ${category.url}, so ${category.title} stays.`;

  if (category.services === 1)
    return `1 service is filed under ${category.title}. Move it to another category first.`;

  if (category.services > 1)
    return `${category.services} services are filed under ${category.title}. Move them to another category first.`;

  if (categories.some((other) => other.parent_id === category.id))
    return `${category.title} has subcategories. Delete them, or move them to another category, first.`;

  return undefined;
}
