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
  visibleTo,
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
  /** The visibility of each of a page's `start` sub-pages; none when it has none. */
  startStepVisibilities(
    pageId: PageId,
  ): Promise<Result<Visibility[], ContentStoreUnavailable>>;
  /** Every category, in the order the site lists them. */
  categories(): Promise<Result<CategoryRecord[], ContentStoreUnavailable>>;
  /** The url of every page with this slug and one of these visibilities. */
  urlsWithSlug(
    slug: string,
    visibilities: readonly Visibility[],
  ): Promise<Result<string[], ContentStoreUnavailable>>;
}

const NOT_FOUND: Resolution = { kind: "not_found" };

/** The site's read: a url resolved under the hierarchy's visibility rules. */
export class PageResolution {
  /** The root supplies content storage's public reads. */
  constructor(private readonly reads: PublicPageReads) {}

  /**
   * The page at `url` if it and every page above it are visible to
   * `viewer`, flagged to hide its Start link when it has a `start` sub-page
   * and `viewer` can see none of them.
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

    const start = await this.reads.startStepVisibilities(page.id);
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
        hideStartLinks:
          start.value.length > 0 &&
          !start.value.some((visibility) => canSee(viewer, visibility)),
      }),
    });
  }

  /**
   * A bare `/<slug>` with no page of its own redirects to the one visible
   * page that slug names. A slug more than one visible page shares (every
   * `start`, say) is ambiguous and resolves to nothing rather than to the
   * wrong page. Only pages `viewer` can see count, so a hidden page never
   * changes the answer.
   */
  private async redirectFor(
    url: string,
    viewer: Viewer,
  ): Promise<Result<Resolution, ContentStoreUnavailable>> {
    const slug = bareSlugOf(url);
    if (slug === null) return ok(NOT_FOUND);

    const candidates = await this.reads.urlsWithSlug(slug, visibleTo(viewer));
    if (!candidates.ok) return candidates;
    // A page beneath one the viewer can't see is hidden too; a second
    // visible page settles it, so stop there.
    const visible: string[] = [];
    for (const candidate of candidates.value) {
      const resolved = await this.resolve(candidate, viewer);
      if (!resolved.ok) return resolved;
      if (resolved.value.kind === "page") visible.push(candidate);
      if (visible.length > 1) return ok(NOT_FOUND);
    }
    const [target] = visible;
    return ok(
      target === undefined || !isSitePath(target)
        ? NOT_FOUND
        : { kind: "redirect", url: target },
    );
  }
}
