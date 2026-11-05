import { recordReferences } from "@govtech-bb/govbbmarkd";
import type { Employee, UserId } from "../modules/auth";
import {
  CollectionNotFound,
  parseRecord,
  RecordConflict,
  RecordExists,
  RecordNotFound,
  type CollectionRecord,
  type CollectionSummary,
  type CollectionView,
  type RecordData,
  type RecordPage,
  type RecordRejected,
} from "../modules/collection";
import type { ContentStoreUnavailable } from "../modules/page";
import { err, ok, type Result } from "../modules/result";

/** Collection storage. */
/** A page whose body mentions some text, live or in its open revision, with those bodies. */
export type PageMentioning = RecordPage & { bodies: readonly string[] };

export interface CollectionStore {
  /**
   * Run `work` as one transaction on behalf of `actorId`, whom storage
   * records against every change it makes; a failed Result rolls it back.
   */
  atomically<R extends Result<unknown, Error>>(
    actorId: UserId,
    work: (store: CollectionStore) => Promise<R>,
  ): Promise<R | Result<never, ContentStoreUnavailable>>;
  /** Every collection, by key, with its record count. */
  collections(): Promise<Result<CollectionSummary[], ContentStoreUnavailable>>;
  /**
   * The pages whose body, live or in an open revision, mentions `text`:
   * candidates for naming a record, which the caller confirms.
   */
  pagesMentioning(
    text: string,
  ): Promise<Result<PageMentioning[], ContentStoreUnavailable>>;
  /** One collection's definition, or null. */
  collection(
    key: string,
  ): Promise<Result<CollectionView | null, ContentStoreUnavailable>>;
  /** A collection's records, by record key. */
  records(
    key: string,
  ): Promise<Result<CollectionRecord[], ContentStoreUnavailable>>;
  /** A record, locked until the transaction ends, or null. */
  lockRecord(
    key: string,
    recordKey: string,
  ): Promise<Result<CollectionRecord | null, ContentStoreUnavailable>>;
  /** Insert a record; null when the collection already has one by that key. */
  insertRecord(
    key: string,
    recordKey: string,
    data: RecordData,
  ): Promise<Result<CollectionRecord | null, ContentStoreUnavailable>>;
  /** Replace a record's data. */
  updateRecord(
    key: string,
    recordKey: string,
    data: RecordData,
  ): Promise<Result<CollectionRecord, ContentStoreUnavailable>>;
  /** Delete a record. */
  deleteRecord(
    key: string,
    recordKey: string,
  ): Promise<Result<void, ContentStoreUnavailable>>;
}

/** Why a record write was refused. */
export type RecordWriteFailure =
  | CollectionNotFound
  | RecordNotFound
  | RecordExists
  | RecordConflict
  | RecordRejected
  | ContentStoreUnavailable;

/**
 * Reading collections, and editors' changes to their records. Each write is
 * checked against the collection's field list and recorded against the
 * employee. Like a page save, a write that sends the `updated_at` it read is
 * refused when the record has moved on since; one that sends none accepts
 * whatever is stored.
 */
export class CollectionEditing {
  constructor(private readonly store: CollectionStore) {}

  /** Every collection, with how many records each holds. */
  list(): Promise<Result<CollectionSummary[], ContentStoreUnavailable>> {
    return this.store.collections();
  }

  /**
   * The pages that show a record in a fact or a contact block, live or in an
   * open revision, by title: its "used on", whether or not the record exists.
   */
  async pages(
    key: string,
    recordKey: string,
  ): Promise<Result<RecordPage[], ContentStoreUnavailable>> {
    const found = await this.store.pagesMentioning(recordKey);
    if (!found.ok) return found;
    const names = (body: string) =>
      recordReferences(body).some(
        (reference) =>
          reference.collection === key && reference.record === recordKey,
      );
    return ok(
      found.value
        .filter((page) => page.bodies.some(names))
        .map(({ id, title, url, visibility, service_id }) => ({
          id,
          title,
          url,
          visibility,
          service_id,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    );
  }

  /** A collection and its records, or null when there is no such collection. */
  async read(
    key: string,
  ): Promise<
    Result<
      { collection: CollectionView; records: CollectionRecord[] } | null,
      ContentStoreUnavailable
    >
  > {
    const collection = await this.store.collection(key);
    if (!collection.ok) return collection;
    if (collection.value === null) return ok(null);
    const records = await this.store.records(key);
    return records.ok
      ? ok({ collection: collection.value, records: records.value })
      : records;
  }

  /** Add a record the collection does not have yet. */
  create(
    key: string,
    recordKey: string,
    data: Readonly<Record<string, unknown>>,
    actor: Employee,
  ): Promise<Result<CollectionRecord, RecordWriteFailure>> {
    return this.store.atomically(actor.id, async (store) => {
      const parsed = await checked(store, key, recordKey, data);
      if (!parsed.ok) return parsed;
      const inserted = await store.insertRecord(key, recordKey, parsed.value);
      if (!inserted.ok) return inserted;
      return inserted.value === null
        ? err(new RecordExists(key, recordKey))
        : ok(inserted.value);
    });
  }

  /** Replace a record's data. */
  save(
    key: string,
    recordKey: string,
    data: Readonly<Record<string, unknown>>,
    expectedUpdatedAt: Date | null,
    actor: Employee,
  ): Promise<Result<CollectionRecord, RecordWriteFailure>> {
    return this.store.atomically(actor.id, async (store) => {
      // The record first, so a save to a missing record is a 404 whatever it sends.
      const current = await unchanged(store, key, recordKey, expectedUpdatedAt);
      if (!current.ok) return current;
      const parsed = await checked(store, key, recordKey, data);
      if (!parsed.ok) return parsed;
      return store.updateRecord(key, recordKey, parsed.value);
    });
  }

  /** Delete a record. */
  delete(
    key: string,
    recordKey: string,
    expectedUpdatedAt: Date | null,
    actor: Employee,
  ): Promise<Result<void, RecordWriteFailure>> {
    return this.store.atomically(actor.id, async (store) => {
      const collection = await store.collection(key);
      if (!collection.ok) return collection;
      if (collection.value === null) return err(new CollectionNotFound(key));
      const current = await unchanged(store, key, recordKey, expectedUpdatedAt);
      if (!current.ok) return current;
      return store.deleteRecord(key, recordKey);
    });
  }
}

/** The record's data checked against its collection's field list. */
async function checked(
  store: CollectionStore,
  key: string,
  recordKey: string,
  data: Readonly<Record<string, unknown>>,
): Promise<
  Result<
    RecordData,
    CollectionNotFound | RecordRejected | ContentStoreUnavailable
  >
> {
  const collection = await store.collection(key);
  if (!collection.ok) return collection;
  if (collection.value === null) return err(new CollectionNotFound(key));
  return parseRecord(collection.value, recordKey, data);
}

/** The stored record, locked, if it is still the version the caller read. */
async function unchanged(
  store: CollectionStore,
  key: string,
  recordKey: string,
  expectedUpdatedAt: Date | null,
): Promise<
  Result<
    CollectionRecord,
    RecordNotFound | RecordConflict | ContentStoreUnavailable
  >
> {
  const locked = await store.lockRecord(key, recordKey);
  if (!locked.ok) return locked;
  if (locked.value === null) return err(new RecordNotFound(key, recordKey));
  if (
    expectedUpdatedAt !== null &&
    locked.value.updated_at !== expectedUpdatedAt.toISOString()
  )
    return err(new RecordConflict());
  return ok(locked.value);
}
