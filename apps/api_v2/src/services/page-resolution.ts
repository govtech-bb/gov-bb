import { categoryCrumbs, type CategoryRecord } from "../modules/navigation";
import {
  bareSlugOf,
  type ContentStoreUnavailable,
  type PageId,
  type Visibility,
} from "../modules/page";
import {
  canSee,
  everPublished,
  hiddenFrom,
  toPublicPage,
  type Ancestor,
  type ResolvablePage,
  type Resolution,
  type Viewer,
} from "../modules/page-visibility";
import { ok, type Result } from "../modules/result";

/** The reads public page resolution needs from content storage. */
export interface PublicPageReads {
  /** The page at this url, or null. */
  pageAt(
    url: string,
  ): Promise<Result<ResolvablePage | null, ContentStoreUnavailable>>;
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
const WITHDRAWN: Resolution = { kind: "withdrawn" };

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
    const found = await this.reads.pageAt(url);
    if (!found.ok) return found;
    const page = found.value;
    if (page === null) return this.redirectFor(url, viewer);

    const ancestors =
      page.parentId === null
        ? ok([])
        : await this.reads.ancestorsOf(page.parentId);
    if (!ancestors.ok) return ancestors;
    if (hiddenFrom(viewer, page, ancestors.value))
      return ok(everPublished(page, ancestors.value) ? WITHDRAWN : NOT_FOUND);

    const start = await this.reads.startStepVisibility(page.id);
    if (!start.ok) return start;
    const categories =
      page.categoryId === null ? ok([]) : await this.reads.categories();
    if (!categories.ok) return categories;
    return ok({
      kind: "page",
      page: toPublicPage(page, {
        ancestors: ancestors.value,
        categoryCrumbs: categoryCrumbs(page.categoryId, categories.value),
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
    if (candidates.value.length !== 1 || target === undefined)
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
