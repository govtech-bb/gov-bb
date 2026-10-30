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
import {
  historyOf,
  type PageChangeEvent,
  type PageHistoryEntry,
} from "../modules/page-history";
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
  /** A page's change events, oldest first, with each actor's name. */
  pageEvents(
    id: PageId,
  ): Promise<Result<PageChangeEvent[], ContentStoreUnavailable>>;
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

  /** What happened to a page, newest first; empty when it has no history. */
  async history(
    id: PageId,
  ): Promise<Result<PageHistoryEntry[], ContentStoreUnavailable>> {
    const events = await this.reads.pageEvents(id);
    return events.ok ? ok(historyOf(events.value)) : events;
  }
}
