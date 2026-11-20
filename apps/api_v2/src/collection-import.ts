/**
 * Loads the seed's data collections into a database that already has its
 * estate (#3783): `import-collections` runs it, `scripts/check-collections.ts`
 * reads the same comparison back over HTTP.
 *
 * The seed (`seed-data/collections.ts`) is the one source: `import-estate`
 * creates its collections in a new database, and this adds what a database
 * imported before them lacks. It creates a missing collection with its
 * records and adds a missing record to an existing collection. A stored
 * record that differs from the seed is an editor's change, so it is skipped
 * and named, unless `force` gives a reason to replace it. A stored field list
 * that differs from the seed's is refused, and nothing is written. It never
 * deletes, and never touches pages, categories, redirects or revisions.
 *
 * Writes go through `PostgresCollections`, checked by `parseNewCollection`
 * and `parseRecord`, in one transaction that names no user, so the
 * `record_change` trigger records each one by `system`.
 */

import { isDeepStrictEqual } from "node:util";
import { sql, TransactionRollbackError } from "drizzle-orm";
import { PostgresCollections } from "./adapters/postgres-collections";
import type { Database } from "./db";
import {
  parseNewCollection,
  parseRecord,
  type CollectionDefinition,
  type CollectionField,
  type CollectionRecord,
  type CollectionView,
  type RecordData,
} from "./modules/collection";
import type { Result } from "./modules/result";
import { COLLECTIONS, type SeedCollection } from "./seed-data/collections";

/** A seed collection as it would be written: checked, its records keyed. */
export interface ParsedSeedCollection {
  definition: CollectionDefinition;
  records: Map<string, RecordData>;
}

/** A collection as the database holds it, or as `GET /collections/:key/records` returns it. */
export interface StoredCollection {
  collection: Pick<CollectionView, "key" | "record_key" | "schema">;
  records: readonly Pick<CollectionRecord, "record_key" | "data">[];
}

/** One way a database's collections differ from the seed. */
export type CollectionDifference =
  | { kind: "missing-collection"; collection: string }
  | { kind: "field-list-differs"; collection: string; detail: string }
  | { kind: "missing-record"; collection: string; record: string }
  | { kind: "record-differs"; collection: string; record: string };

/**
 * Check a seed collection as `POST /collections` and a record write would.
 * Throws on a seed that breaks a rule: that is a developer's mistake, and
 * nothing should be written from it.
 */
export function parseSeedCollection(
  seed: SeedCollection,
): ParsedSeedCollection {
  const definition = parseNewCollection(seed);
  if (!definition.ok)
    throw new Error(`seed collection ${seed.key}: ${definition.error.message}`);
  const records = new Map<string, RecordData>();
  for (const data of seed.records) {
    const recordKey = data[seed.record_key];
    if (typeof recordKey !== "string")
      throw new Error(
        `seed collection ${seed.key}: a record has no ${seed.record_key}`,
      );
    if (records.has(recordKey))
      throw new Error(
        `seed collection ${seed.key}: two records are keyed ${recordKey}`,
      );
    const parsed = parseRecord(definition.value, recordKey, data);
    if (!parsed.ok)
      throw new Error(
        `seed collection ${seed.key}, record ${recordKey}: ${parsed.error.message}`,
      );
    records.set(recordKey, parsed.value);
  }
  return { definition: definition.value, records };
}

const describeFields = (
  recordKey: string,
  fields: readonly CollectionField[],
) =>
  `record_key ${recordKey}; fields ${fields
    .map((field) => `${field.key} (${field.type}, "${field.label}")`)
    .join(", ")}`;

/**
 * How the stored collection differs from the seed, record by record. Records
 * the database has and the seed does not are an editor's, and not a
 * difference.
 */
export function compareCollection(
  seed: ParsedSeedCollection,
  stored: StoredCollection | null,
): CollectionDifference[] {
  const collection = seed.definition.key;
  const differences: CollectionDifference[] = [];
  if (stored === null) {
    differences.push({ kind: "missing-collection", collection });
  } else if (
    stored.collection.record_key !== seed.definition.record_key ||
    !isDeepStrictEqual(stored.collection.schema, seed.definition.schema)
  ) {
    return [
      {
        kind: "field-list-differs",
        collection,
        detail: `stored: ${describeFields(stored.collection.record_key, stored.collection.schema.fields)}. seed: ${describeFields(seed.definition.record_key, seed.definition.schema.fields)}.`,
      },
    ];
  }
  const current = new Map(
    (stored?.records ?? []).map((record) => [record.record_key, record.data]),
  );
  for (const [record, data] of seed.records) {
    const had = current.get(record);
    if (had === undefined)
      differences.push({ kind: "missing-record", collection, record });
    else if (!isDeepStrictEqual(had, data))
      differences.push({ kind: "record-differs", collection, record });
  }
  return differences;
}

/** One line naming a difference, for the check and the refusal. */
export function describeDifference(difference: CollectionDifference): string {
  switch (difference.kind) {
    case "missing-collection":
      return `${difference.collection}: collection missing`;
    case "field-list-differs":
      return `${difference.collection}: field list differs. ${difference.detail}`;
    case "missing-record":
      return `${difference.collection}/${difference.record}: record missing`;
    case "record-differs":
      return `${difference.collection}/${difference.record}: record differs from the seed`;
  }
}

/** What a run wrote, or would have written on a dry run. */
export interface CollectionImportReport {
  /** Why differing records were replaced, or null when they were skipped. */
  reason: string | null;
  collections_created: number;
  /** Key of each collection created. */
  created: string[];
  records_added: number;
  /** `collection/record` of each record added, including one an editor deleted that is still in the seed. */
  added: string[];
  records_skipped: number;
  /** `collection/record` of each record kept because it differs from the seed. */
  skipped: string[];
  records_replaced: number;
  /** `collection/record` of each record `force` replaced. */
  replaced: string[];
}

/** The import's field-list check failed; nothing was written. */
export class FieldListRefused extends Error {
  constructor(differences: readonly CollectionDifference[]) {
    super(
      `${differences.map(describeDifference).join("\n")}\nrefusing: a collection's field list is never changed by the import, and nothing was written.`,
    );
  }
}

/** A store result's value; a storage failure throws, rolling the run back. */
function must<T>(result: Result<T, Error>): T {
  if (result.ok) return result.value;
  const { cause } = result.error;
  throw new Error(
    `${result.error.message}${cause instanceof Error ? ` (${cause.message})` : ""}`,
    { cause: result.error },
  );
}

/**
 * Bring the database's collections up to the seed, in one transaction.
 * `dryRun` does the real work and rolls it back, so its counts and refusals
 * are real.
 */
export async function importCollections(
  db: Database,
  {
    dryRun,
    force,
    collections = COLLECTIONS,
  }: {
    dryRun: boolean;
    force?: string;
    collections?: readonly SeedCollection[];
  },
): Promise<CollectionImportReport> {
  // Every seed collection is checked before the database is opened.
  const seeds = collections.map(parseSeedCollection);
  let report!: CollectionImportReport;
  try {
    await db.transaction(async (tx) => {
      // Collection writes take no content lock (that orders page writes), so
      // hold the editor's record and collection writes off instead until this
      // commits; reads carry on. `exclusive`, not `share row exclusive`: it
      // also waits out an editor's `select … for update`, which could
      // otherwise deadlock with a `force` replace of the same record.
      await tx.execute(
        sql`lock table data_collections, collection_records in exclusive mode`,
      );
      const store = new PostgresCollections(tx);
      const plans = [];
      for (const seed of seeds) {
        const key = seed.definition.key;
        const collection = must(await store.collection(key));
        const stored = collection && {
          collection,
          records: must(await store.records(key)),
        };
        plans.push({ seed, differences: compareCollection(seed, stored) });
      }
      const refused = plans
        .flatMap((plan) => plan.differences)
        .filter((difference) => difference.kind === "field-list-differs");
      if (refused.length > 0) throw new FieldListRefused(refused);

      report = {
        reason: force ?? null,
        collections_created: 0,
        created: [],
        records_added: 0,
        added: [],
        records_skipped: 0,
        skipped: [],
        records_replaced: 0,
        replaced: [],
      };
      for (const { seed, differences } of plans) {
        for (const difference of differences) {
          if (difference.kind === "missing-collection") {
            if (!must(await store.insertCollection(seed.definition)))
              throw new Error(`collection ${difference.collection} appeared`);
            report.created.push(difference.collection);
            report.collections_created++;
          } else if (difference.kind === "missing-record") {
            const data = seed.records.get(difference.record)!;
            const key = difference.collection;
            if (!must(await store.insertRecord(key, difference.record, data)))
              throw new Error(`record ${key}/${difference.record} appeared`);
            report.added.push(`${key}/${difference.record}`);
            report.records_added++;
          } else if (difference.kind === "record-differs") {
            const name = `${difference.collection}/${difference.record}`;
            if (force === undefined) {
              report.skipped.push(name);
              report.records_skipped++;
              continue;
            }
            const data = seed.records.get(difference.record)!;
            must(
              await store.updateRecord(
                difference.collection,
                difference.record,
                data,
              ),
            );
            report.replaced.push(name);
            report.records_replaced++;
          }
        }
      }
      if (dryRun) tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
  return report;
}
