import { NotApprover, type Employee } from "../modules/auth";
import {
  creationOf,
  cycleOf,
  PageConflict,
  PageNotFound,
  pendingRevisionOf,
  placedUnder,
  revisionOf,
  withDefaults,
  workingCopy,
  type ContentStoreUnavailable,
  type EditorPage,
  type NewPage,
  type PageDocument,
  type PageFields,
  type PageId,
  type PageRejected,
  type PageValues,
  type PendingRevision,
  type SaveFields,
} from "../modules/page";
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

/** A public page's pending revision as a save writes it. */
export interface PendingRevisionRecord {
  readonly fields: PageFields;
  readonly liveUpdatedAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly contributors: readonly string[];
}

/** An audit entry: what happened to a page, who did it, and the page as it then stood. */
export interface PageChange {
  readonly page: PageDocument;
  readonly action: "created" | "updated" | "published" | "deleted";
  readonly actorId: string;
}

/** The persistence the editor's page operations need. */
export interface PageRecords {
  /** Take the shared content advisory lock first; an error Result rolls back everything written. */
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
  /** Refuse a new page URL owned by a category, including an empty category. */
  checkPageUrl(
    url: string,
  ): Promise<Result<void, PageRejected | ContentStoreUnavailable>>;
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
  /** Refuse what `replace` would, without keeping the write. */
  checkReplace(
    id: PageId,
    page: PageRevision,
  ): Promise<Result<void, PageRejected | ContentStoreUnavailable>>;
  /** File a page's uncategorised sub-pages, all the way down, under its category. */
  fileUncategorisedBelow(
    id: PageId,
    categoryId: string,
  ): Promise<Result<void, ContentStoreUnavailable>>;
  /** A page's open revision, or null. */
  openRevision(
    pageId: PageId,
  ): Promise<Result<PendingRevision | null, ContentStoreUnavailable>>;
  /** Start a page's open revision, or overwrite it, keeping who started it. */
  writeRevision(
    pageId: PageId,
    revision: PendingRevisionRecord,
  ): Promise<Result<PendingRevision, ContentStoreUnavailable>>;
  /** Discard a page's open revision, if it has one. */
  dropRevision(pageId: PageId): Promise<Result<void, ContentStoreUnavailable>>;
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
}

/**
 * The editor's page operations: reads of any visibility, and writes that
 * commit with their search text and audit entry or not at all. Only an
 * approver changes what citizens see: sets a page's visibility, creates one
 * public, or deletes a public one. A save to a public page that keeps it
 * public, whoever makes it, goes into the page's pending revision and leaves
 * the live page as it is (#3198).
 */
export class PageEditing {
  /** The root supplies content storage and the clock. */
  constructor(
    private readonly records: PageRecords,
    private readonly clock: Clock,
  ) {}

  /**
   * The page with this id as the editor works on it: with its pending
   * revision laid over it. Two reads rather than one snapshot: a save between
   * them leaves this with a version no save matches, so the next save is a
   * conflict, never a lost write.
   */
  async open(
    id: PageId,
  ): Promise<Result<EditorPage | null, ContentStoreUnavailable>> {
    const live = await this.records.find(id);
    if (!live.ok) return live;
    if (live.value === null) return ok(null);
    const revision = await this.records.openRevision(id);
    if (!revision.ok) return revision;
    return ok(workingCopy(live.value, revision.value));
  }

  /** The page's pending revision, or null when it has none. */
  revision(
    id: PageId,
  ): Promise<Result<PendingRevision | null, ContentStoreUnavailable>> {
    return this.records.openRevision(id);
  }

  /** Create a page where it belongs, stamping publication when it starts public, and index and audit it. */
  create(
    page: NewPage,
    actor: Employee,
  ): Promise<
    Result<PageDocument, PageRejected | NotApprover | ContentStoreUnavailable>
  > {
    return this.records.atomically(async (records) => {
      if (page.visibility === "public" && !actor.roles.includes("approver"))
        return err(new NotApprover());
      const available = await records.checkPageUrl(page.url);
      if (!available.ok) return available;
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
   * Replace a page's fields, and return the page as the editor now works on
   * it. With `expectedUpdatedAt`, a page that has moved on since the caller
   * read it is refused rather than silently discarding whoever wrote first;
   * without it the caller accepts whatever is stored. A public page's version
   * is its pending revision's, when it has one.
   *
   * A save that keeps a public page public goes into its pending revision.
   * Any other save writes the page, as it always has: one to a page that is
   * not public, and an approver's that takes a page out of public view. That
   * one sends the whole working copy, so it closes the pending revision
   * rather than leaving it over a page citizens no longer see.
   */
  save(
    id: PageId,
    fields: SaveFields,
    expectedUpdatedAt: Date | null,
    actor: Employee,
  ): Promise<
    Result<
      EditorPage,
      | PageRejected
      | PageNotFound
      | PageConflict
      | NotApprover
      | ContentStoreUnavailable
    >
  > {
    return this.records.atomically(async (records) => {
      const locked = await records.lock(id);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (current === null) return err(new PageNotFound(id));
      const pending = await records.openRevision(id);
      if (!pending.ok) return pending;
      if (
        expectedUpdatedAt !== null &&
        (pending.value ?? current).updated_at !==
          expectedUpdatedAt.toISOString()
      )
        return err(new PageConflict(id));
      if (
        fields.visibility !== current.visibility &&
        !actor.roles.includes("approver")
      )
        return err(new NotApprover());

      if (fields.url !== current.url) {
        const available = await records.checkPageUrl(fields.url);
        if (!available.ok) return available;
      }

      // Null moves the page to its category's root; only leaving it out keeps the parent.
      const placed = await place(records, id, {
        ...fields,
        parent_id:
          fields.parent_id === undefined
            ? (pending.value?.fields ?? current).parent_id
            : fields.parent_id,
      });
      if (!placed.ok) return placed;
      if (current.visibility === "public" && fields.visibility === "public") {
        // Refused now for what publishing it would be refused for today.
        const valid = await records.checkReplace(
          id,
          revisionOf(current, placed.value, this.clock()),
        );
        if (!valid.ok) return valid;
        const proposed = await records.writeRevision(
          id,
          pendingRevisionOf(
            current,
            pending.value,
            placed.value,
            actor.id,
            this.clock(),
          ),
        );
        return proposed.ok
          ? ok(workingCopy(current, proposed.value))
          : proposed;
      }
      // Past the pending revision's version too, which can run ahead of the
      // clock, so no client holding it matches the page's new one.
      const now = new Date(
        Math.max(
          this.clock().getTime(),
          pending.value === null ? 0 : Date.parse(pending.value.updated_at) + 1,
        ),
      );
      const revision = revisionOf(current, placed.value, now);
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
      if (pending.value !== null) {
        const dropped = await records.dropRevision(id);
        if (!dropped.ok) return dropped;
      }
      const logged = await records.appendChange({
        page: saved.value,
        action: revision.action,
        actorId: actor.id,
      });
      return logged.ok ? ok(workingCopy(saved.value, null)) : logged;
    });
  }

  /** Delete a page and audit it; one with sub-pages is refused, and one already gone is not an error. */
  delete(
    id: PageId,
    actor: Employee,
  ): Promise<
    Result<void, PageRejected | NotApprover | ContentStoreUnavailable>
  > {
    return this.records.atomically(async (records) => {
      const locked = await records.lock(id);
      if (!locked.ok) return locked;
      if (
        locked.value?.visibility === "public" &&
        !actor.roles.includes("approver")
      )
        return err(new NotApprover());
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
