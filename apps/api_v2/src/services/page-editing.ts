import type { Employee } from "../modules/auth";
import {
  creationOf,
  cycleOf,
  PageVersionConflict,
  PageNotFound,
  placedUnder,
  revisionOf,
  withDefaults,
  type ContentStoreUnavailable,
  type NewPage,
  type PageDocument,
  type PageContentVersion,
  type PageFields,
  type PageId,
  type PageRejected,
  type PageValues,
  type SaveFields,
} from "../modules/page";
import { err, ok, type Result } from "../modules/result";
import {
  claimPageEditLock,
  clearPageEditLock,
  describePageEditLock,
  extendPageEditLock,
  ownsPageEditLock,
  PageEditLockLost,
  type AcquirePageEditLock,
  type RenewPageEditLock,
  type PageEditLockConflict,
  type PageEditLockRecord,
  type PageEditLockStatus,
  type PageEditLockToken,
} from "../modules/page-edit-lock";
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
  /** Take the shared content advisory lock first; an error Result rolls back everything written. */
  atomically<R extends Result<unknown, Error>>(
    work: (records: PageRecords) => Promise<R>,
  ): Promise<R | Result<never, ContentStoreUnavailable>>;
  /** The page with this id, or null. */
  find(
    id: PageId,
  ): Promise<Result<PageDocument | null, ContentStoreUnavailable>>;
  /** The page with this id, held against other writers until the transaction ends, or null. */
  lockPageRow(
    id: PageId,
  ): Promise<Result<PageDocument | null, ContentStoreUnavailable>>;
  /** Refuse a new page URL owned by a category, including an empty category. */
  checkPageUrl(
    url: string,
  ): Promise<Result<void, PageRejected | ContentStoreUnavailable>>;
  /** Read ownership with authoritative database time while holding the page row lock. */
  readPageEditLock(
    id: PageId,
  ): Promise<Result<PageEditLockSnapshot, ContentStoreUnavailable>>;
  /** Replace ownership under the same page row lock used by content writes. */
  writePageEditLock(
    id: PageId,
    record: PageEditLockRecord,
  ): Promise<Result<void, ContentStoreUnavailable>>;
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
}

/** Database time is read after row-lock acquisition, so waiting cannot extend an already expired claim. */
export interface PageEditLockSnapshot {
  readonly record: PageEditLockRecord;
  readonly now: Date;
}

type PageWriteFailure =
  | PageRejected
  | PageNotFound
  | PageVersionConflict
  | PageEditLockLost
  | ContentStoreUnavailable;
type PageLockReadFailure = PageNotFound | ContentStoreUnavailable;

/** The page-editing capability keeps content and acquisition credentials distinct at every write. */
export interface IPageEditing {
  /** Read any admitted editor page without acquiring its edit lock. */
  get(
    id: PageId,
  ): Promise<Result<PageDocument | null, ContentStoreUnavailable>>;
  /** New pages start at the database's initial content version. */
  create(
    page: NewPage,
    actor: Employee,
  ): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>>;
  /** Save only over the reviewed content version under this acquisition. */
  save(
    id: PageId,
    fields: SaveFields,
    expectedVersion: PageContentVersion,
    editLockToken: PageEditLockToken,
    actor: Employee,
  ): Promise<Result<PageDocument, PageWriteFailure>>;
  /** Delete only the reviewed version under this acquisition. */
  delete(
    id: PageId,
    expectedVersion: PageContentVersion,
    editLockToken: PageEditLockToken,
    actor: Employee,
  ): Promise<Result<void, PageWriteFailure>>;
  /** Read presence or reconcile a token without extending its lifetime. */
  readPageEditLock(
    id: PageId,
    actor: Employee,
    token?: PageEditLockToken,
  ): Promise<Result<PageEditLockStatus, PageLockReadFailure>>;
  /** Acquisition and explicit takeover compare the observed public generation. */
  acquirePageEditLock(
    id: PageId,
    actor: Employee,
    token: PageEditLockToken,
    command: AcquirePageEditLock,
  ): Promise<
    Result<PageEditLockStatus, PageLockReadFailure | PageEditLockConflict>
  >;
  /** Renewal cannot revive or replace an acquisition. */
  renewPageEditLock(
    id: PageId,
    actor: Employee,
    token: PageEditLockToken,
    command: RenewPageEditLock,
  ): Promise<
    Result<PageEditLockStatus, PageLockReadFailure | PageEditLockLost>
  >;
  /** Superseded release does not affect the current holder. */
  releasePageEditLock(
    id: PageId,
    actor: Employee,
    token: PageEditLockToken,
  ): Promise<Result<PageEditLockStatus, PageLockReadFailure>>;
}

/** The editor's page operations: reads of any visibility, and writes that commit with their search text and audit entry or not at all. */
export class PageEditing implements IPageEditing {
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

  /** Create a page where it belongs, stamping publication when it starts public, and index and audit it. */
  create(
    page: NewPage,
    actor: Employee,
  ): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>> {
    return this.records.atomically(async (records) => {
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

  /** Replace only the reviewed version, while the exact editing acquisition is still live. */
  save(
    id: PageId,
    fields: SaveFields,
    expectedVersion: PageContentVersion,
    editLockToken: PageEditLockToken,
    actor: Employee,
  ): Promise<Result<PageDocument, PageWriteFailure>> {
    return this.records.atomically(async (records) => {
      const locked = await records.lockPageRow(id);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (current === null) return err(new PageNotFound(id));
      const allowed = await checkPageWrite(
        records,
        current,
        expectedVersion,
        editLockToken,
        actor,
      );
      if (!allowed.ok) return allowed;

      if (fields.url !== current.url) {
        const available = await records.checkPageUrl(fields.url);
        if (!available.ok) return available;
      }

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

  /** Delete the reviewed version and audit it; version and ownership checks precede every effect. */
  delete(
    id: PageId,
    expectedVersion: PageContentVersion,
    editLockToken: PageEditLockToken,
    actor: Employee,
  ): Promise<Result<void, PageWriteFailure>> {
    return this.records.atomically(async (records) => {
      const locked = await records.lockPageRow(id);
      if (!locked.ok) return locked;
      if (locked.value === null) return err(new PageNotFound(id));
      const allowed = await checkPageWrite(
        records,
        locked.value,
        expectedVersion,
        editLockToken,
        actor,
      );
      if (!allowed.ok) return allowed;
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

  /** Presence reads serialize with acquisitions but never extend their deadlines. */
  readPageEditLock(id: PageId, actor: Employee, token?: PageEditLockToken) {
    return this.withPageRowLock(id, async ({ record, now }) =>
      ok(describePageEditLock(record, now, actor.id, token)),
    );
  }

  /** Acquire or explicitly take over one observed generation; retries do not extend a live grant. */
  acquirePageEditLock(
    id: PageId,
    actor: Employee,
    token: PageEditLockToken,
    command: AcquirePageEditLock,
  ) {
    return this.withPageRowLock<PageEditLockStatus, PageEditLockConflict>(
      id,
      async ({ record, now }, records) => {
        const next = claimPageEditLock(id, record, now, actor, token, command);
        if (!next.ok) return next;
        if (next.value !== record) {
          const written = await records.writePageEditLock(id, next.value);
          if (!written.ok) return written;
        }
        return ok(describePageEditLock(next.value, now, actor.id, token));
      },
    );
  }

  /** Renew only the live acquisition, applying the server-owned idle deadline. */
  renewPageEditLock(
    id: PageId,
    actor: Employee,
    token: PageEditLockToken,
    command: RenewPageEditLock,
  ) {
    return this.withPageRowLock<PageEditLockStatus, PageEditLockLost>(
      id,
      async ({ record, now }, records) => {
        const next = extendPageEditLock(
          id,
          record,
          now,
          actor.id,
          token,
          command.activitySequence,
        );
        if (!next.ok) return next;
        const written = await records.writePageEditLock(id, next.value);
        return written.ok
          ? ok(describePageEditLock(next.value, now, actor.id, token))
          : written;
      },
    );
  }

  /** Release only this credential; an older tab cannot clear a later acquisition. */
  releasePageEditLock(id: PageId, actor: Employee, token: PageEditLockToken) {
    return this.withPageRowLock<PageEditLockStatus, never>(
      id,
      async ({ record, now }, records) => {
        const next = clearPageEditLock(record, actor.id, token);
        if (next !== record) {
          const written = await records.writePageEditLock(id, next);
          if (!written.ok) return written;
        }
        return ok(describePageEditLock(next, now, actor.id, token));
      },
    );
  }

  private withPageRowLock<T, E extends Error = never>(
    id: PageId,
    work: (
      snapshot: PageEditLockSnapshot,
      records: PageRecords,
    ) => Promise<Result<T, E | ContentStoreUnavailable>>,
  ): Promise<Result<T, E | PageLockReadFailure>> {
    return this.records.atomically(async (records) => {
      const page = await records.lockPageRow(id);
      if (!page.ok) return page;
      if (page.value === null) return err(new PageNotFound(id));
      const snapshot = await records.readPageEditLock(id);
      return snapshot.ok ? work(snapshot.value, records) : snapshot;
    });
  }
}

/** Both checks run after locking the content row and before content, index or audit effects. */
async function checkPageWrite(
  records: PageRecords,
  page: PageDocument,
  expectedVersion: PageContentVersion,
  token: PageEditLockToken,
  actor: Employee,
): Promise<
  Result<void, PageVersionConflict | PageEditLockLost | ContentStoreUnavailable>
> {
  if (page.version !== expectedVersion)
    return err(new PageVersionConflict(page.id));
  const snapshot = await records.readPageEditLock(page.id);
  if (!snapshot.ok) return snapshot;
  return ownsPageEditLock(
    snapshot.value.record,
    snapshot.value.now,
    actor.id,
    token,
  )
    ? ok(undefined)
    : err(new PageEditLockLost(page.id));
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
