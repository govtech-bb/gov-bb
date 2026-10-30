import { z } from "zod";
import {
  groupServices,
  serviceAt,
  type IndexedPage,
  type ServiceDetail,
  type ServiceSummary,
} from "../modules/estate-services";
import type {
  ContentStoreUnavailable,
  PageId,
  ReviewQueueEntry,
} from "../modules/page";
import { ok, type Result } from "../modules/result";

/** The change log's size and newest timestamp. */
export const EstateVersion = z.object({
  count: z.int(),
  latest: z.iso.datetime().nullable(),
});

/** The change log's size and newest timestamp. */
export type EstateVersion = z.infer<typeof EstateVersion>;

/** The reads the editor's index needs from content storage. */
export interface IndexReads {
  /** Every page with its category, as the service index groups them. */
  indexedPages(): Promise<
    Result<readonly IndexedPage[], ContentStoreUnavailable>
  >;
  /** The change log's size and newest timestamp. */
  changeLogVersion(): Promise<Result<EstateVersion, ContentStoreUnavailable>>;
  /** Every revision waiting for review, the longest-waiting first. */
  submittedRevisions(): Promise<
    Result<ReviewQueueEntry[], ContentStoreUnavailable>
  >;
}

/** What the editor's index lists, and the token it polls to know when to refetch. */
export class EditorIndex {
  /** The root supplies content storage's index reads. */
  constructor(private readonly reads: IndexReads) {}

  /** The estate grouped into services, ordered by title. */
  async listServices(): Promise<
    Result<ServiceSummary[], ContentStoreUnavailable>
  > {
    const pages = await this.reads.indexedPages();
    return pages.ok ? ok(groupServices(pages.value)) : pages;
  }

  /** All stored page paths and unambiguous bare-slug redirects, regardless of visibility or category. */
  async pagePaths(): Promise<Result<string[], ContentStoreUnavailable>> {
    const pages = await this.reads.indexedPages();
    if (!pages.ok) return pages;
    const slugs = new Map<string, number>();
    for (const page of pages.value)
      slugs.set(page.slug, (slugs.get(page.slug) ?? 0) + 1);
    return ok(
      [
        ...new Set(
          pages.value.flatMap((page) =>
            slugs.get(page.slug) === 1
              ? [page.url, `/${page.slug}`]
              : [page.url],
          ),
        ),
      ].sort(),
    );
  }

  /** The service whose entry page this is, with every page in it, or null. */
  async service(
    id: PageId,
  ): Promise<Result<ServiceDetail | null, ContentStoreUnavailable>> {
    const pages = await this.reads.indexedPages();
    return pages.ok ? ok(serviceAt(pages.value, id)) : pages;
  }

  /**
   * A cheap token for "has anything changed". `change_events` is append-only
   * and gets a row on every page and category change.
   * Clients poll this and refetch only when it moves.
   */
  version(): Promise<Result<EstateVersion, ContentStoreUnavailable>> {
    return this.reads.changeLogVersion();
  }

  /** The changes waiting for an approver, the longest-waiting first. */
  reviewQueue(): Promise<Result<ReviewQueueEntry[], ContentStoreUnavailable>> {
    return this.reads.submittedRevisions();
  }
}
