import { isSitePath } from "@govtech-bb/govbbmarkd/content-url";
import { pageCategory, type CategoryRecord } from "../modules/navigation";
import {
  bareSlugOf,
  type ContentStoreUnavailable,
  type PageId,
  type Visibility,
} from "../modules/page";
import {
  canSee,
  hiddenFrom,
  toPublicPage,
  type Ancestor,
  type ResolvablePage,
  type Resolution,
  type Viewer,
} from "../modules/page-visibility";
import { ok, type Result } from "../modules/result";

/** A stored redirect or exact page from one database snapshot. */
export type PageRoute =
  | { readonly kind: "redirect"; readonly destinationUrl: string }
  | { readonly kind: "page"; readonly page: ResolvablePage };

/** The reads public page resolution needs from content storage. */
export interface PublicPageReads {
  /** A stored rule takes precedence over the exact page, even for preview readers. */
  pageOrRedirectAt(
    url: string,
  ): Promise<Result<PageRoute | null, ContentStoreUnavailable>>;
  /** The pages above this one, root first; a loop in the data ends rather than repeating. */
  ancestorsOf(
    pageId: PageId,
  ): Promise<Result<Ancestor[], ContentStoreUnavailable>>;
  /** The visibility of a page's `start` sub-page, or null when it has none. */
  startStepVisibility(
    pageId: PageId,
  ): Promise<Result<Visibility | null, ContentStoreUnavailable>>;
  /** Every category, in the order the site lists them. */
  categories(): Promise<Result<CategoryRecord[], ContentStoreUnavailable>>;
  /** The url of every page with this slug. */
  urlsWithSlug(
    slug: string,
  ): Promise<Result<string[], ContentStoreUnavailable>>;
}

const NOT_FOUND: Resolution = { kind: "not_found" };

/** The site's read: a url resolved under the hierarchy's visibility rules. */
export class PageResolution {
  /** The root supplies content storage's public reads. */
  constructor(private readonly reads: PublicPageReads) {}

  /**
   * The page at `url` if it and every page above it are visible to
   * `viewer`, flagged to hide its Start link when its `start` sub-page is not.
   */
  async resolve(
    url: string,
    viewer: Viewer,
  ): Promise<Result<Resolution, ContentStoreUnavailable>> {
    const found = await this.reads.pageOrRedirectAt(url);
    if (!found.ok) return found;
    const route = found.value;
    if (route === null) return this.redirectFor(url, viewer);
    if (route.kind === "redirect") {
      const target = route.destinationUrl;
      return ok(
        isSitePath(target) && target !== url
          ? { kind: "redirect", url: target }
          : NOT_FOUND,
      );
    }
    const page = route.page;

    const ancestors =
      page.parentId === null
        ? ok([])
        : await this.reads.ancestorsOf(page.parentId);
    if (!ancestors.ok) return ancestors;
    if (hiddenFrom(viewer, page, ancestors.value)) return ok(NOT_FOUND);

    const start = await this.reads.startStepVisibility(page.id);
    if (!start.ok) return start;
    const categories =
      page.categoryId === null ? ok([]) : await this.reads.categories();
    if (!categories.ok) return categories;
    const { crumbs, category, subcategory } = pageCategory(
      page.categoryId,
      categories.value,
    );
    return ok({
      kind: "page",
      page: toPublicPage(page, {
        ancestors: ancestors.value,
        categoryCrumbs: crumbs,
        category,
        subcategory,
        hideStartLinks: start.value !== null && !canSee(viewer, start.value),
      }),
    });
  }

  /**
   * A bare `/<slug>` with no page of its own redirects to the one visible
   * page that slug names. A slug more than one page shares (every `start`,
   * say) is ambiguous and resolves to nothing rather than to the wrong page.
   */
  private async redirectFor(
    url: string,
    viewer: Viewer,
  ): Promise<Result<Resolution, ContentStoreUnavailable>> {
    const slug = bareSlugOf(url);
    if (slug === null) return ok(NOT_FOUND);

    const candidates = await this.reads.urlsWithSlug(slug);
    if (!candidates.ok) return candidates;
    const [target] = candidates.value;
    if (
      candidates.value.length !== 1 ||
      target === undefined ||
      !isSitePath(target)
    )
      return ok(NOT_FOUND);

    const resolved = await this.resolve(target, viewer);
    if (!resolved.ok) return resolved;
    return ok(
      resolved.value.kind === "page"
        ? { kind: "redirect", url: target }
        : NOT_FOUND,
    );
  }
}
