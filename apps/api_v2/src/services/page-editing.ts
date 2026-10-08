import type { Employee } from "../modules/auth";
import {
  creationOf,
  cycleOf,
  PageConflict,
  PageNotFound,
  pathChangeOf,
  placedUnder,
  revisionOf,
  withDefaults,
  type ContentStoreUnavailable,
  type NewPage,
  type PageDocument,
  type PageFields,
  type PageId,
  type PageRejected,
  type PageValues,
  type SaveFields,
} from "../modules/page";
import {
  readSnapshot,
  type PageSnapshot,
  type PageVersion,
} from "../modules/page-history";
import { err, ok, type Result } from "../modules/result";
import { chunkMarkdown, type SearchChunk } from "../modules/search-text";

/** Wall-clock time for the stamps a write records. */
export type Clock = () => Date;

/** A page as an insert stores it. */
export interface NewPageRecord {
  readonly id: PageId | undefined;
  readonly values: PageValues;
  readonly publishedAt: Date | null;
}

/** A page as a save overwrites it. */
export interface PageRevision {
  readonly values: PageValues;
  readonly updatedAt: Date;
  readonly publishedAt: Date | null;
}

/** An audit entry: what happened to a page, who did it, and the page as it then stood. */
export interface PageChange {
  readonly page: PageDocument;
  readonly action: "created" | "updated" | "published" | "deleted";
  readonly actorId: string;
}

/** The persistence the editor's page operations need. */
export interface PageRecords {
  /** Run `work` as one transaction; an error result rolls back everything it wrote. */
  atomically<R extends Result<unknown, Error>>(
    work: (records: PageRecords) => Promise<R>,
  ): Promise<R | Result<never, ContentStoreUnavailable>>;
  /** The page with this id, or null. */
  find(
    id: PageId,
  ): Promise<Result<PageDocument | null, ContentStoreUnavailable>>;
  /** The page with this id, held against other writers until the transaction ends, or null. */
  lock(
    id: PageId,
  ): Promise<Result<PageDocument | null, ContentStoreUnavailable>>;
  /** Hold every other hierarchy change until the transaction ends, so two moves cannot close one loop. */
  holdHierarchy(): Promise<Result<void, ContentStoreUnavailable>>;
  /** The ids of the pages above this one; a loop in the data ends rather than repeating. */
  ancestorIds(
    pageId: PageId,
  ): Promise<Result<string[], ContentStoreUnavailable>>;
  /** A page's category, or null when it has none or there is no such page. */
  categoryOf(
    pageId: PageId,
  ): Promise<Result<string | null, ContentStoreUnavailable>>;
  /** Insert a page; storage refuses an unknown category or parent, a mismatched category, and a taken url or id. */
  insert(
    page: NewPageRecord,
  ): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>>;
  /** Overwrite a page that exists; storage refuses what an insert would. */
  replace(
    id: PageId,
    page: PageRevision,
  ): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>>;
  /** File a page's uncategorised sub-pages, all the way down, under its category. */
  fileUncategorisedBelow(
    id: PageId,
    categoryId: string,
  ): Promise<Result<void, ContentStoreUnavailable>>;
  /** Replace a page's search chunks. */
  replaceSearchChunks(
    pageId: PageId,
    chunks: readonly SearchChunk[],
  ): Promise<Result<void, ContentStoreUnavailable>>;
  /** Delete a page, returning it as it stood, or null when there was none; one with sub-pages is refused. */
  remove(
    id: PageId,
  ): Promise<
    Result<PageDocument | null, PageRejected | ContentStoreUnavailable>
  >;
  /** Append an entry to the append-only change log. */
  appendChange(
    change: PageChange,
  ): Promise<Result<void, ContentStoreUnavailable>>;
  /** A page's change log, newest first; empty when nothing is recorded. */
  versionsOf(
    id: PageId,
  ): Promise<Result<PageVersion[], ContentStoreUnavailable>>;
  /** The page as a change recorded it, unparsed, or null when there is no such version. */
  snapshotAt(
    id: PageId,
    version: number,
  ): Promise<Result<unknown, ContentStoreUnavailable>>;
}

/** The editor's page operations: reads of any visibility, and writes that commit with their search text and audit entry or not at all. */
export class PageEditing {
  /** The root supplies content storage and the clock. */
  constructor(
    private readonly records: PageRecords,
    private readonly clock: Clock,
  ) {}

  /** The page with this id, whatever its visibility. */
  get(
    id: PageId,
  ): Promise<Result<PageDocument | null, ContentStoreUnavailable>> {
    return this.records.find(id);
  }

  /** A page's change log, newest first, or null when there is no such page and never was. */
  async history(
    id: PageId,
  ): Promise<Result<PageVersion[] | null, ContentStoreUnavailable>> {
    const versions = await this.records.versionsOf(id);
    if (!versions.ok || versions.value.length > 0) return versions;
    const page = await this.records.find(id);
    if (!page.ok) return page;
    return ok(page.value === null ? null : []);
  }

  /** The page as a change left it, or null when there is no such version or it can no longer be read. */
  async snapshot(
    id: PageId,
    version: number,
  ): Promise<Result<PageSnapshot | null, ContentStoreUnavailable>> {
    const recorded = await this.records.snapshotAt(id, version);
    return recorded.ok ? ok(readSnapshot(recorded.value)) : recorded;
  }

  /** Create a page where it belongs, stamping publication when it starts public, and index and audit it. */
  create(
    page: NewPage,
    actor: Employee,
  ): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>> {
    return this.records.atomically(async (records) => {
      const placed = await place(records, page.id, withDefaults(page));
      if (!placed.ok) return placed;
      const created = await records.insert(
        creationOf(page.id, placed.value, this.clock()),
      );
      if (!created.ok) return created;
      const indexed = await records.replaceSearchChunks(
        created.value.id,
        chunkMarkdown(created.value.body_markdown),
      );
      if (!indexed.ok) return indexed;
      const logged = await records.appendChange({
        page: created.value,
        action: "created",
        actorId: actor.id,
      });
      return logged.ok ? created : logged;
    });
  }

  /**
   * Replace a page's fields. With `expectedUpdatedAt`, a page that has moved
   * on since the caller read it is refused rather than silently discarding
   * whoever wrote first; without it the caller accepts whatever is stored.
   */
  save(
    id: PageId,
    fields: SaveFields,
    expectedUpdatedAt: Date | null,
    actor: Employee,
  ): Promise<
    Result<
      PageDocument,
      PageRejected | PageNotFound | PageConflict | ContentStoreUnavailable
    >
  > {
    return this.records.atomically(async (records) => {
      const locked = await records.lock(id);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (current === null) return err(new PageNotFound(id));
      if (
        expectedUpdatedAt !== null &&
        current.updated_at !== expectedUpdatedAt.toISOString()
      )
        return err(new PageConflict(id));
      const moved = pathChangeOf(current, fields);
      if (moved) return err(moved);

      // Null moves the page to its category's root; only leaving it out keeps the parent.
      const placed = await place(records, id, {
        ...fields,
        parent_id:
          fields.parent_id === undefined ? current.parent_id : fields.parent_id,
      });
      if (!placed.ok) return placed;
      const revision = revisionOf(current, placed.value, this.clock());
      const saved = await records.replace(id, revision);
      if (!saved.ok) return saved;
      if (saved.value.category_id !== null) {
        const filed = await records.fileUncategorisedBelow(
          id,
          saved.value.category_id,
        );
        if (!filed.ok) return filed;
      }
      const indexed = await records.replaceSearchChunks(
        id,
        chunkMarkdown(saved.value.body_markdown),
      );
      if (!indexed.ok) return indexed;
      const logged = await records.appendChange({
        page: saved.value,
        action: revision.action,
        actorId: actor.id,
      });
      return logged.ok ? saved : logged;
    });
  }

  /** Delete a page and audit it; one with sub-pages is refused, and one already gone is not an error. */
  delete(
    id: PageId,
    actor: Employee,
  ): Promise<Result<void, PageRejected | ContentStoreUnavailable>> {
    return this.records.atomically(async (records) => {
      const removed = await records.remove(id);
      if (!removed.ok) return removed;
      if (removed.value === null) return ok(undefined);
      const logged = await records.appendChange({
        page: removed.value,
        action: "deleted",
        actorId: actor.id,
      });
      return logged.ok ? ok(undefined) : logged;
    });
  }
}

/**
 * Where a write puts a page: beneath its parent and in its parent's category
 * when it names none, and never beneath itself. Hierarchy changes are held
 * still before the loop check, so two moves cannot each pass it and together
 * close one.
 */
async function place(
  records: PageRecords,
  id: PageId | undefined,
  fields: PageFields,
): Promise<Result<PageFields, PageRejected | ContentStoreUnavailable>> {
  if (fields.parent_id === null) return ok(fields);
  const held = await records.holdHierarchy();
  if (!held.ok) return held;
  if (id !== undefined) {
    const above = await records.ancestorIds(fields.parent_id);
    if (!above.ok) return above;
    const loop = cycleOf(id, fields.parent_id, above.value);
    if (loop) return err(loop);
  }
  if (fields.category_id !== null) return ok(fields);
  const parentCategory = await records.categoryOf(fields.parent_id);
  if (!parentCategory.ok) return parentCategory;
  return ok(placedUnder(fields, parentCategory.value));
}
