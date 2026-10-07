import { z } from "zod";
import {
  groupServices,
  serviceAt,
  type IndexedPage,
  type ServiceDetail,
  type ServiceSummary,
} from "../modules/estate-services";
import {
  taxonomyOf,
  type CategoryRecord,
  type TaxonomyEntry,
} from "../modules/navigation";
import type { ContentStoreUnavailable, PageId } from "../modules/page";
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
  /** Every category, in the order the site lists them. */
  categories(): Promise<Result<CategoryRecord[], ContentStoreUnavailable>>;
  /** The change log's size and newest timestamp. */
  changeLogVersion(): Promise<Result<EstateVersion, ContentStoreUnavailable>>;
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

  /** Every category a page can be filed under, each before its subcategories. */
  async taxonomy(): Promise<Result<TaxonomyEntry[], ContentStoreUnavailable>> {
    const categories = await this.reads.categories();
    return categories.ok ? ok(taxonomyOf(categories.value)) : categories;
  }

  /**
   * A cheap token for "has anything changed". `change_events` is append-only
   * and gets a row on every write, so its count plus its newest timestamp
   * identify the state of the whole estate without reading any of it.
   * Clients poll this and refetch only when it moves.
   */
  version(): Promise<Result<EstateVersion, ContentStoreUnavailable>> {
    return this.reads.changeLogVersion();
  }
}
