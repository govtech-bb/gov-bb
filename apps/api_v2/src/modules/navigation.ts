/**
 * What the site navigates by: categories and their subcategories, what each
 * lists, the catalog of every visible page, and the text search indexes.
 *
 * A category lists only the pages at its root (no parent). A subcategory is a
 * category with a parent, and the site lists both in `position` order. A
 * `start` step is a form's way in rather than a page of its own, so the
 * catalog and search leave it out.
 */

import { z } from "zod";
import type { Frontmatter, PageId } from "./page";
import type { Breadcrumb } from "./page-visibility";
import type { SearchChunk } from "./search-text";

/** A category as storage keeps it. */
export interface CategoryRecord {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly parentId: string | null;
}

/** A page as a category's list, the catalog and search read it. */
export interface ListablePage {
  readonly id: PageId;
  readonly parentId: PageId | null;
  readonly slug: string;
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  readonly formId: string | null;
  readonly frontmatter: Frontmatter;
}

/** A category as the site links to it. */
export const CategoryRef = z.object({
  slug: z.string(),
  url: z.string().describe("`/<category>`, or `/<category>/<subcategory>`."),
  title: z.string(),
  description: z.string().nullable(),
});

/** A category as the site links to it. */
export type CategoryRef = z.infer<typeof CategoryRef>;

/** A category with the subcategories it lists. */
export const CategoryNode = CategoryRef.extend({
  subcategories: z.array(CategoryRef),
});

/** A category with the subcategories it lists. */
export type CategoryNode = z.infer<typeof CategoryNode>;

/** A page as a list shows it. */
export const PageSummary = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  digital: z
    .boolean()
    .describe("It has a form, or its frontmatter says it is digital."),
});

/** A page as a list shows it. */
export type PageSummary = z.infer<typeof PageSummary>;

/** A category page: the category, its parent, its subcategories, and its pages. */
export const CategoryListing = z.object({
  category: CategoryRef,
  parent: CategoryRef.nullable().describe(
    "The category this is a subcategory of, or null.",
  ),
  subcategories: z
    .array(CategoryRef)
    .describe("Those with something to list, in order."),
  pages: z
    .array(PageSummary)
    .describe("The pages at the category's root, A to Z."),
});

/** A category page. */
export type CategoryListing = z.infer<typeof CategoryListing>;

/** A page as the catalog lists it. */
export const CatalogEntry = PageSummary.extend({
  stage: z.string().nullable(),
});

/** A page as the catalog lists it. */
export type CatalogEntry = z.infer<typeof CatalogEntry>;

/** A page as search indexes it. */
export const SearchDocument = PageSummary.extend({
  keywords: z.array(z.string()),
  chunks: z
    .array(z.object({ heading: z.string().nullable(), body: z.string() }))
    .describe(
      "The body as plain text, split at its headings, in order. " +
        "Joined with spaces (heading, then body, skipping empties) " +
        "they are the whole body's text.",
    ),
});

/** A page as search indexes it. */
export type SearchDocument = z.infer<typeof SearchDocument>;

const byTitle = <T extends { title: string }>(a: T, b: T) =>
  a.title.localeCompare(b.title);

function urlOf(
  category: CategoryRecord,
  categories: readonly CategoryRecord[],
): string {
  const parent = categories.find((row) => row.id === category.parentId);
  return parent ? `/${parent.slug}/${category.slug}` : `/${category.slug}`;
}

function refOf(
  category: CategoryRecord,
  categories: readonly CategoryRecord[],
): CategoryRef {
  return {
    slug: category.slug,
    url: urlOf(category, categories),
    title: category.title,
    description: category.description,
  };
}

/** A page's category crumbs: the parent category first, for a subcategory. */
export function categoryCrumbs(
  categoryId: string | null,
  categories: readonly CategoryRecord[],
): Breadcrumb[] {
  const category = categories.find((row) => row.id === categoryId);
  if (!category) return [];
  const parent = categories.find((row) => row.id === category.parentId);
  return [...(parent ? [parent] : []), category].map((row) => ({
    name: row.title,
    url: urlOf(row, categories),
  }));
}

/**
 * The categories the site lists, in order, each with its subcategories. A
 * category with nothing to list, in it or in its subcategories, is left out.
 */
export function categoryTree(
  categories: readonly CategoryRecord[],
  listing: ReadonlySet<string>,
): CategoryNode[] {
  return categories
    .filter((row) => row.parentId === null)
    .map((row) => ({
      row,
      subcategories: categories.filter(
        (sub) => sub.parentId === row.id && listing.has(sub.id),
      ),
    }))
    .filter(
      ({ row, subcategories }) =>
        listing.has(row.id) || subcategories.length > 0,
    )
    .map(({ row, subcategories }) => ({
      ...refOf(row, categories),
      subcategories: subcategories.map((sub) => refOf(sub, categories)),
    }));
}

/**
 * The category a path names, `[slug]` or `[parent, slug]`, with what it
 * lists besides its pages. Null when there is no such category or it lists
 * nothing.
 */
export function categoryAt(
  path: readonly [string] | readonly [string, string],
  categories: readonly CategoryRecord[],
  listing: ReadonlySet<string>,
): {
  readonly id: string;
  readonly ref: Omit<CategoryListing, "pages">;
} | null {
  const [first, second] = path;
  const parent =
    second === undefined
      ? undefined
      : categories.find((row) => row.slug === first && row.parentId === null);
  if (second !== undefined && !parent) return null;
  const slug = second ?? first;
  const category = categories.find(
    (row) => row.slug === slug && row.parentId === (parent?.id ?? null),
  );
  if (!category) return null;

  const subcategories = categories.filter(
    (row) => row.parentId === category.id && listing.has(row.id),
  );
  if (!listing.has(category.id) && subcategories.length === 0) return null;
  return {
    id: category.id,
    ref: {
      category: refOf(category, categories),
      parent: parent ? refOf(parent, categories) : null,
      subcategories: subcategories.map((row) => refOf(row, categories)),
    },
  };
}

/** It has a form, or its frontmatter says it is a digital service. */
function isDigital(page: ListablePage): boolean {
  return page.formId !== null || page.frontmatter.service_type === "digital";
}

/** A page as a list shows it. */
function summaryOf(page: ListablePage): PageSummary {
  return {
    url: page.url,
    title: page.title,
    description: page.description,
    digital: isDigital(page),
  };
}

/** A category's pages, A to Z. */
export function listed(pages: readonly ListablePage[]): PageSummary[] {
  return pages.map(summaryOf).sort(byTitle);
}

/** The pages the catalog lists: all of them but `start` steps, which are a form's way in, not a page of their own. */
export function inCatalog(pages: readonly ListablePage[]): ListablePage[] {
  return pages.filter(
    (page) => !(page.parentId !== null && page.slug === "start"),
  );
}

/** Catalog pages as the catalog lists them, A to Z. */
export function catalogOf(pages: readonly ListablePage[]): CatalogEntry[] {
  return pages
    .map((page) => ({
      ...summaryOf(page),
      stage: page.frontmatter.stage ?? null,
    }))
    .sort(byTitle);
}

/** Catalog pages with their keywords and text, as search indexes them, A to Z. */
export function searchDocumentsOf(
  pages: readonly ListablePage[],
  chunks: ReadonlyMap<string, readonly SearchChunk[]>,
): SearchDocument[] {
  return pages
    .map((page) => ({
      ...summaryOf(page),
      keywords: page.frontmatter.keywords ?? [],
      chunks: [...(chunks.get(page.id) ?? [])],
    }))
    .sort(byTitle);
}
