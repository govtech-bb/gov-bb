import { z } from "zod";
import { LastEditedBy } from "./content-attribution";
import type { FieldError } from "./page";
import { err, ok, type Result } from "./result";

/** A category id cannot be substituted for a page id. */
export const CategoryId = z.guid().toLowerCase().brand<"CategoryId">();
/** A parsed category identifier. */
export type CategoryId = z.infer<typeof CategoryId>;

/** Category versions round-trip at the database's millisecond precision. */
export const CategoryStamp = z.iso
  .datetime({ offset: true, precision: 3 })
  .brand<"CategoryStamp">();
/** A category version, compared by instant rather than timezone spelling. */
export type CategoryStamp = z.infer<typeof CategoryStamp>;

const categorySlug = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .brand<"CategorySlug">();
const categoryTitle = z.string().min(1).max(200);

/** Transport fields; semantic field rules are reported separately as 422s. */
export const CategoryFields = z.strictObject({
  title: z.string(),
  slug: z.string(),
  parent_id: CategoryId.nullable(),
  description: z.string().nullable(),
});
/** The complete fields supplied by a category editor. */
export type CategoryFields = z.infer<typeof CategoryFields>;

const categoryValues = CategoryFields.extend({
  title: categoryTitle,
  slug: categorySlug,
});
/** Category fields after their text constraints and whitespace rules have been applied. */
export type CategoryValues = z.infer<typeof categoryValues>;

/** Editor-only category metadata; services counts directly filed roots of every visibility. */
export const EditorCategory = categoryValues.extend({
  id: CategoryId,
  url: z.string(),
  position: z.int().nonnegative(),
  services: z.int().nonnegative(),
  reserved_route: z.boolean(),
  updated_at: CategoryStamp,
  last_edited_by: LastEditedBy,
});
/** One category shared by management and every page picker. */
export type EditorCategory = z.infer<typeof EditorCategory>;

/** A reorder replaces one complete sibling order, never a subset. */
export const CategoryOrder = z.strictObject({
  parent_id: CategoryId.nullable(),
  expected: z.array(
    z.strictObject({ id: CategoryId, updated_at: CategoryStamp }),
  ),
  ordered_ids: z.array(CategoryId),
});
/** The sibling snapshot and permutation originally read by the editor. */
export type CategoryOrder = z.infer<typeof CategoryOrder>;

/** Deletion checks all pages, not merely the service count shown in the editor. */
export const CategoryBlockers = z.object({
  pages: z.int().nonnegative(),
  subcategories: z.int().nonnegative(),
  reserved_route: z.boolean(),
});
/** Everything preventing a category's deletion or address change. */
export type CategoryBlockers = z.infer<typeof CategoryBlockers>;

/** App-owned addresses and asset prefixes cannot become category addresses. */
export const RESERVED_CATEGORY_PATHS: readonly string[] = [
  "/bank-holiday-calendar",
  "/cms-preview",
  "/feedback",
  "/images",
  "/javascript-required",
  "/preview-start-page",
  "/search-results",
  "/service-unavailable",
  "/services",
  "/tell-us",
  "/business-trade/crop-over-permits",
  "/health-and-emergency-services/find-an-emergency-shelter",
  "/health-and-emergency-services/find-an-open-pharmacy",
  "/health-and-emergency-services/water-outages",
  "/money-financial-support/calculate-severance-pay",
  "/money-financial-support/national-insurance-for-self-employed-workers",
  "/pensions-and-gratuities/calculate-your-pension",
];
const anchors = new Set(
  RESERVED_CATEGORY_PATHS.filter((path) => path.split("/").length === 3).map(
    (path) => "/" + path.split("/")[1],
  ),
);

/** Whether this category address anchors a hard-coded app route. */
export function isCategoryAnchor(url: string): boolean {
  return anchors.has(url);
}

/** A refused category field, ready for the editor's actionable error presentation. */
export class CategoryRejected extends Error {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryRejected" as const;
  /** Fields the author can correct without discarding the dialog. */
  constructor(readonly errors: readonly FieldError[]) {
    super("Category could not be saved.");
  }
}
/** An update or deletion requires a category that still exists. */
export class CategoryNotFound extends Error {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryNotFound" as const;
  /** The category the operation expected to find. */
  constructor(readonly id: CategoryId) {
    super(`No category with id ${id}`);
  }
}
/** A category operation must not overwrite a version its author did not read. */
export class CategoryConflict extends Error {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryConflict" as const;
  /** Applies to row versions and complete sibling snapshots alike. */
  constructor() {
    super(
      "These categories changed since you loaded them. Refresh before trying again.",
    );
  }
}
/** A category cannot be deleted while pages, children or app routes use it. */
export class CategoryInUse extends Error {
  /** Stable failure discriminator. */
  readonly _tag = "CategoryInUse" as const;
  /** All blockers, including unpublished and supporting pages. */
  constructor(readonly blockers: CategoryBlockers) {
    super(
      "This category still has pages, subcategories, or a reserved app-route address.",
    );
  }
}

/** Parse editable category text without turning field-rule failures into transport errors. */
export function parseCategoryFields(
  fields: CategoryFields,
): Result<CategoryValues, CategoryRejected> {
  const parsed = categoryValues.safeParse({
    ...fields,
    title: fields.title.trim(),
    description: fields.description?.trim() || null,
  });
  if (parsed.success) return ok(parsed.data);
  return err(
    new CategoryRejected(
      parsed.error.issues.map((issue) => ({
        field: String(issue.path[0]),
        message:
          issue.path[0] === "title"
            ? "Enter a name of at most 200 characters."
            : "Use up to 100 lower-case letters, numbers and single hyphens between words.",
      })),
    ),
  );
}

/** Resolve a two-level category address and refuse app reservations and invalid parents. */
export function categoryAddress(
  fields: CategoryValues,
  categories: readonly EditorCategory[],
  id?: CategoryId,
): Result<string, CategoryRejected> {
  const parent = categories.find((row) => row.id === fields.parent_id);
  if (
    fields.parent_id !== null &&
    (!parent || parent.parent_id !== null || parent.id === id)
  )
    return err(
      new CategoryRejected([
        {
          field: "parent_id",
          message: "Choose another top-level category as the parent.",
        },
      ]),
    );
  if (fields.parent_id !== null && anchors.has("/" + fields.slug))
    return err(
      new CategoryRejected([
        {
          field: "parent_id",
          message:
            "This slug anchors an app route and must stay at the top level.",
        },
      ]),
    );
  if (categories.some((row) => row.id !== id && row.slug === fields.slug))
    return err(
      new CategoryRejected([
        { field: "slug", message: "Another category already uses this slug." },
      ]),
    );
  const url = parent ? `/${parent.slug}/${fields.slug}` : `/${fields.slug}`;
  if (
    RESERVED_CATEGORY_PATHS.some(
      (path) => url === path || url.startsWith(path + "/"),
    )
  )
    return err(
      new CategoryRejected([
        {
          field: "slug",
          message: "This address is reserved for an app route.",
        },
      ]),
    );
  return ok(url);
}

/** Reject malformed permutations before comparing the snapshot with storage. */
export function parseCategoryOrder(
  order: CategoryOrder,
): Result<CategoryOrder, CategoryRejected> {
  const expected = new Set(order.expected.map((row) => row.id));
  const ordered = new Set(order.ordered_ids);
  if (
    expected.size !== order.expected.length ||
    ordered.size !== order.ordered_ids.length ||
    expected.size !== ordered.size ||
    order.ordered_ids.some((id) => !expected.has(id))
  )
    return err(
      new CategoryRejected([
        {
          field: "ordered_ids",
          message: "Send every expected sibling exactly once.",
        },
      ]),
    );
  return ok(order);
}

/** Advance a category version even when two writes share a millisecond or the clock goes backward. */
export function nextCategoryStamp(
  previous: CategoryStamp,
  now: Date,
): CategoryStamp {
  return CategoryStamp.parse(
    new Date(Math.max(now.getTime(), Date.parse(previous) + 1)).toISOString(),
  );
}
