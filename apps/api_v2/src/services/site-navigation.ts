import {
  catalogOf,
  categoryAt,
  categoryTree,
  inCatalog,
  listed,
  searchDocumentsOf,
  type CatalogEntry,
  type CategoryListing,
  type CategoryNode,
  type CategoryRecord,
  type ListablePage,
  type SearchDocument,
} from "../modules/navigation";
import { createHash } from "node:crypto";
import type { ContentStoreUnavailable, Visibility } from "../modules/page";
import { visibleTo, type Viewer } from "../modules/page-visibility";
import { ok, type Result } from "../modules/result";
import type { SearchChunk } from "../modules/search-text";
import type { EstateVersion } from "./editor-index";

/** The reads site navigation needs from content storage. */
export interface NavigationReads {
  /** Every category, in the order the site lists them. */
  categories(): Promise<Result<CategoryRecord[], ContentStoreUnavailable>>;
  /** The categories with at least one page of these visibilities at their root. */
  listingCategoryIds(
    visibilities: readonly Visibility[],
  ): Promise<Result<Set<string>, ContentStoreUnavailable>>;
  /** The pages of these visibilities at a category's root. */
  rootPagesIn(
    categoryId: string,
    visibilities: readonly Visibility[],
  ): Promise<Result<ListablePage[], ContentStoreUnavailable>>;
  /** Every page of these visibilities beneath only pages of them: what such a reader can open. */
  visiblePages(
    visibilities: readonly Visibility[],
  ): Promise<Result<ListablePage[], ContentStoreUnavailable>>;
  /** These pages' search chunks, in order. */
  searchChunksOf(
    pageIds: readonly string[],
  ): Promise<Result<Map<string, SearchChunk[]>, ContentStoreUnavailable>>;
  /** The change log's size and newest timestamp. */
  changeLogVersion(): Promise<Result<EstateVersion, ContentStoreUnavailable>>;
}

/** What the site navigates by, as a viewer may see it. */
export class SiteNavigation {
  /** The root supplies content storage's navigation reads. */
  constructor(private readonly reads: NavigationReads) {}

  /** The categories the site lists, in order, each with its subcategories. */
  async categories(
    viewer: Viewer,
  ): Promise<Result<CategoryNode[], ContentStoreUnavailable>> {
    const [categories, listing] = await Promise.all([
      this.reads.categories(),
      this.reads.listingCategoryIds(visibleTo(viewer)),
    ]);
    if (!categories.ok) return categories;
    if (!listing.ok) return listing;
    return ok(categoryTree(categories.value, listing.value));
  }

  /**
   * A category page: `[slug]` for a category, `[parent, slug]` for a
   * subcategory. Null when there is no such category or it lists nothing.
   */
  async categoryListing(
    path: readonly [string] | readonly [string, string],
    viewer: Viewer,
  ): Promise<Result<CategoryListing | null, ContentStoreUnavailable>> {
    const [categories, listing] = await Promise.all([
      this.reads.categories(),
      this.reads.listingCategoryIds(visibleTo(viewer)),
    ]);
    if (!categories.ok) return categories;
    if (!listing.ok) return listing;
    const category = categoryAt(path, categories.value, listing.value);
    if (category === null) return ok(null);

    const pages = await this.reads.rootPagesIn(category.id, visibleTo(viewer));
    if (!pages.ok) return pages;
    return ok({ ...category.ref, pages: listed(pages.value) });
  }

  /** Every page the viewer can open, A to Z: for the sitemap and service lists. */
  async catalog(
    viewer: Viewer,
  ): Promise<Result<CatalogEntry[], ContentStoreUnavailable>> {
    const pages = await this.reads.visiblePages(visibleTo(viewer));
    if (!pages.ok) return pages;
    return ok(catalogOf(inCatalog(pages.value)));
  }

  /** What search indexes: every catalog page, with its text. */
  async searchDocuments(
    viewer: Viewer,
  ): Promise<Result<SearchDocument[], ContentStoreUnavailable>> {
    const visible = await this.reads.visiblePages(visibleTo(viewer));
    if (!visible.ok) return visible;
    const pages = inCatalog(visible.value);
    const chunks =
      pages.length === 0
        ? ok(new Map<string, SearchChunk[]>())
        : await this.reads.searchChunksOf(pages.map((page) => page.id));
    if (!chunks.ok) return chunks;
    return ok(searchDocumentsOf(pages, chunks.value));
  }

  /**
   * An opaque token that moves whenever any content changes, so the site can
   * drop its cached pages at once rather than wait out their max-age. Hashed
   * so it doesn't say how many changes there have been or when the last was.
   */
  async version(): Promise<Result<string, ContentStoreUnavailable>> {
    const version = await this.reads.changeLogVersion();
    if (!version.ok) return version;
    const { count, latest } = version.value;
    return ok(
      createHash("sha256")
        .update(`${count}:${latest}`)
        .digest("base64url")
        .slice(0, 16),
    );
  }
}
