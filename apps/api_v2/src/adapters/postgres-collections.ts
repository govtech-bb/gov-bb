/**
 * Collection storage in PostgreSQL. Rows become `CollectionView`s and
 * `CollectionRecord`s on the way out; every failure becomes
 * `ContentStoreUnavailable`, with the driver's error kept only as its cause.
 * The database's `record_change` trigger records each write in
 * `change_events`, against the transaction's `app.user_id`.
 */

import { and, asc, count, eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import type { UserId } from "../modules/auth";
import {
  CollectionSchema,
  type CollectionRecord,
  type CollectionSummary,
  type CollectionView,
  type RecordData,
} from "../modules/collection";
import { ContentStoreUnavailable } from "../modules/page";
import { err, ok, type Result } from "../modules/result";
import { collectionRecords, dataCollections } from "../schema";
import type { CollectionStore } from "../services/collection-editing";

type CollectionRow = typeof dataCollections.$inferSelect;
type RecordRow = typeof collectionRecords.$inferSelect;

const toView = (row: CollectionRow): CollectionView => ({
  key: row.key,
  title: row.title,
  record_key: row.recordKey,
  // A field list a developer got wrong fails the read, inside `attempt`,
  // rather than reaching a client.
  schema: CollectionSchema.parse(row.schema),
  schema_version: row.schemaVersion,
  updated_at: row.updatedAt.toISOString(),
});

const toRecord = (row: RecordRow): CollectionRecord => ({
  record_key: row.recordKey,
  data: row.data,
  updated_at: row.updatedAt.toISOString(),
});

async function attempt<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<Result<T, ContentStoreUnavailable>> {
  try {
    return ok(await run());
  } catch (cause) {
    return err(new ContentStoreUnavailable(operation, cause));
  }
}

const recordIs = (key: string, recordKey: string) =>
  and(
    eq(collectionRecords.collectionKey, key),
    eq(collectionRecords.recordKey, recordKey),
  );

export class PostgresCollections implements CollectionStore {
  constructor(private readonly db: Database) {}

  async atomically<R extends Result<unknown, Error>>(
    actorId: UserId,
    work: (store: CollectionStore) => Promise<R>,
  ): Promise<R | Result<never, ContentStoreUnavailable>> {
    let refused: R | undefined;
    try {
      return await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.user_id', ${actorId}, true)`,
        );
        const result = await work(new PostgresCollections(tx));
        if (!result.ok) {
          refused = result;
          tx.rollback();
        }
        return result;
      });
    } catch (cause) {
      return refused ?? err(new ContentStoreUnavailable("transaction", cause));
    }
  }

  async collections(): Promise<
    Result<CollectionSummary[], ContentStoreUnavailable>
  > {
    return attempt("collections", async () =>
      (
        await this.db
          .select({
            collection: dataCollections,
            records: count(collectionRecords.id),
          })
          .from(dataCollections)
          .leftJoin(
            collectionRecords,
            eq(collectionRecords.collectionKey, dataCollections.key),
          )
          .groupBy(dataCollections.id)
          .orderBy(asc(dataCollections.key))
      ).map((row) => ({
        ...toView(row.collection),
        record_count: row.records,
      })),
    );
  }

  async collection(
    key: string,
  ): Promise<Result<CollectionView | null, ContentStoreUnavailable>> {
    return attempt("collection", async () => {
      const [row] = await this.db
        .select()
        .from(dataCollections)
        .where(eq(dataCollections.key, key));
      return row ? toView(row) : null;
    });
  }

  async records(
    key: string,
  ): Promise<Result<CollectionRecord[], ContentStoreUnavailable>> {
    const rows = await attempt("records", () =>
      this.db
        .select()
        .from(collectionRecords)
        .where(eq(collectionRecords.collectionKey, key))
        .orderBy(asc(collectionRecords.recordKey)),
    );
    return rows.ok ? ok(rows.value.map(toRecord)) : rows;
  }

  async lockRecord(
    key: string,
    recordKey: string,
  ): Promise<Result<CollectionRecord | null, ContentStoreUnavailable>> {
    const rows = await attempt("lockRecord", () =>
      this.db
        .select()
        .from(collectionRecords)
        .where(recordIs(key, recordKey))
        .for("update"),
    );
    if (!rows.ok) return rows;
    const [row] = rows.value;
    return ok(row ? toRecord(row) : null);
  }

  async insertRecord(
    key: string,
    recordKey: string,
    data: RecordData,
  ): Promise<Result<CollectionRecord | null, ContentStoreUnavailable>> {
    const rows = await attempt("insertRecord", () =>
      this.db
        .insert(collectionRecords)
        .values({ collectionKey: key, recordKey, data })
        .onConflictDoNothing()
        .returning(),
    );
    if (!rows.ok) return rows;
    const [row] = rows.value;
    return ok(row ? toRecord(row) : null);
  }

  async updateRecord(
    key: string,
    recordKey: string,
    data: RecordData,
  ): Promise<Result<CollectionRecord, ContentStoreUnavailable>> {
    // `touch_updated_at` moves `updated_at` when the data changes, and keeps
    // it when nothing did, as for a page.
    const rows = await attempt("updateRecord", () =>
      this.db
        .update(collectionRecords)
        .set({ data })
        .where(recordIs(key, recordKey))
        .returning(),
    );
    if (!rows.ok) return rows;
    const [row] = rows.value;
    if (!row) throw new Error("A locked record was not there to update");
    return ok(toRecord(row));
  }

  async deleteRecord(
    key: string,
    recordKey: string,
  ): Promise<Result<void, ContentStoreUnavailable>> {
    const rows = await attempt("deleteRecord", () =>
      this.db.delete(collectionRecords).where(recordIs(key, recordKey)),
    );
    return rows.ok ? ok(undefined) : rows;
  }
}
