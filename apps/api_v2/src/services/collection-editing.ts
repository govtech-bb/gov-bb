import { isDeepStrictEqual } from "node:util";
import type { Employee, UserId } from "../modules/auth";
import type { EditVersion } from "../modules/edit-concurrency";
import {
  CollectionNotFound,
  parseRecord,
  RecordConflict,
  RecordExists,
  RecordNotFound,
  type CollectionRecord,
  type EditorCollectionRecord,
  type RecordEnvelope,
  type CollectionSummary,
  type CollectionView,
  type RecordData,
  type RecordRejected,
} from "../modules/collection";
import type { ContentStoreUnavailable } from "../modules/page";
import { err, ok, type Result } from "../modules/result";

/** Collection storage. */
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
  /** One collection's definition, or null. */
  collection(
    key: string,
  ): Promise<Result<CollectionView | null, ContentStoreUnavailable>>;
  /** One coherent private edit snapshot. */
  recordEnvelope(
    key: string,
    recordKey: string,
  ): Promise<Result<RecordEnvelope | null, ContentStoreUnavailable>>;
  /** A collection's records, by record key. */
  records(
    key: string,
  ): Promise<Result<CollectionRecord[], ContentStoreUnavailable>>;
  /** A record, locked until the transaction ends, or null. */
  lockRecord(
    key: string,
    recordKey: string,
  ): Promise<Result<EditorCollectionRecord | null, ContentStoreUnavailable>>;
  /** Insert a record; null when the collection already has one by that key. */
  insertRecord(
    key: string,
    recordKey: string,
    data: RecordData,
  ): Promise<Result<EditorCollectionRecord | null, ContentStoreUnavailable>>;
  /** Replace a record's data. */
  updateRecord(
    key: string,
    recordKey: string,
    data: RecordData,
  ): Promise<Result<EditorCollectionRecord, ContentStoreUnavailable>>;
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
 * employee. A required record version refuses writes based on content the
 * editor has not read.
 */
export class CollectionEditing {
  constructor(private readonly store: CollectionStore) {}

  /** Every collection, with how many records each holds. */
  list(): Promise<Result<CollectionSummary[], ContentStoreUnavailable>> {
    return this.store.collections();
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

  /** Private detail uses the same definition and record snapshot. */
  detail(
    key: string,
    recordKey: string,
  ): Promise<Result<RecordEnvelope | null, ContentStoreUnavailable>> {
    return this.store.recordEnvelope(key, recordKey);
  }

  /** Add a record the collection does not have yet. */
  create(
    key: string,
    recordKey: string,
    data: Readonly<Record<string, unknown>>,
    actor: Employee,
  ): Promise<Result<EditorCollectionRecord, RecordWriteFailure>> {
    return this.store.atomically(actor.id, async (store) => {
      const collection = await store.collection(key);
      if (!collection.ok) return collection;
      if (!collection.value) return err(new CollectionNotFound(key));
      const parsed = parseRecord(collection.value, recordKey, data);
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
    expectedVersion: EditVersion,
    actor: Employee,
  ): Promise<Result<RecordEnvelope, RecordWriteFailure>> {
    return this.store.atomically(actor.id, async (store) => {
      const collection = await store.collection(key);
      if (!collection.ok) return collection;
      if (!collection.value) return err(new CollectionNotFound(key));
      // Check existence and the original version before field validation.
      const current = await unchanged(store, key, recordKey, expectedVersion);
      if (!current.ok) return current;
      const parsed = parseRecord(collection.value, recordKey, data);
      if (!parsed.ok) return parsed;
      if (!isDeepStrictEqual(current.value.data, parsed.value)) {
        const saved = await store.updateRecord(key, recordKey, parsed.value);
        if (!saved.ok) return saved;
      }
      const snapshot = await store.recordEnvelope(key, recordKey);
      if (!snapshot.ok) return snapshot;
      if (!snapshot.value)
        throw new Error("Saved record missing inside its write transaction");
      return ok(snapshot.value);
    });
  }

  /** Delete a record. */
  delete(
    key: string,
    recordKey: string,
    expectedVersion: EditVersion,
    actor: Employee,
  ): Promise<Result<void, RecordWriteFailure>> {
    return this.store.atomically(actor.id, async (store) => {
      const collection = await store.collection(key);
      if (!collection.ok) return collection;
      if (collection.value === null) return err(new CollectionNotFound(key));
      const current = await unchanged(store, key, recordKey, expectedVersion);
      if (!current.ok) return current;
      return store.deleteRecord(key, recordKey);
    });
  }
}

/** The stored record, locked, if it is still the version the caller read. */
async function unchanged(
  store: CollectionStore,
  key: string,
  recordKey: string,
  expectedVersion: EditVersion,
): Promise<
  Result<
    EditorCollectionRecord,
    RecordNotFound | RecordConflict | ContentStoreUnavailable
  >
> {
  const locked = await store.lockRecord(key, recordKey);
  if (!locked.ok) return locked;
  if (locked.value === null) return err(new RecordNotFound(key, recordKey));
  if (locked.value.version !== expectedVersion)
    return err(new RecordConflict());
  return ok(locked.value);
}
