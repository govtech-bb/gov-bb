/**
 * Loads the seven pages, four collections and 163 pharmacy records the block
 * editor spike proved the model against.
 *
 * The corpus lives here rather than in the spike package it came from because
 * the API now owns the estate: `landing_v2` and `builder_v2` read it over
 * HTTP instead of each seeding a browser database of their own, so one copy
 * in one place is the whole point.
 *
 * Every insert is `on conflict do nothing`, so this is additive and
 * idempotent: it inserts what is missing and never overwrites what an author
 * has since changed. That is the same choice the browser seed makes, for the
 * same reason — an early-return guard there meant a newly added page never
 * reached a database that had been seeded before, silently.
 */

import { sql } from "drizzle-orm";
import { collectionRecords, contentPages, dataCollections } from "./schema";
import { COLLECTIONS, DOCUMENTS, RECORDS_BY_COLLECTION } from "./seed-data";
import type { Database } from "./store";

export async function seed(db: Database): Promise<{
  collections: number;
  records: number;
  documents: number;
}> {
  let collections = 0;
  let records = 0;
  let documents = 0;

  for (const collection of COLLECTIONS) {
    const result = await db
      .insert(dataCollections)
      .values({
        key: collection.key,
        title: collection.title,
        recordKey: collection.record_key,
        schema: collection.schema,
      })
      .onConflictDoNothing()
      .returning({ key: dataCollections.key });
    collections += result.length;
  }

  for (const [collectionKey, rows] of Object.entries(RECORDS_BY_COLLECTION)) {
    for (const row of rows) {
      const result = await db
        .insert(collectionRecords)
        .values({
          collectionKey,
          recordKey: row.record_key,
          data: row.data,
        })
        .onConflictDoNothing()
        .returning({ id: collectionRecords.id });
      records += result.length;
    }
  }

  for (const doc of DOCUMENTS) {
    const result = await db
      .insert(contentPages)
      .values({
        url: doc.url,
        slug: doc.slug,
        schemaName: doc.schema_name,
        documentType: doc.document_type,
        title: doc.title,
        description: doc.description,
        isDraft: doc.is_draft,
        body: doc.body,
      })
      .onConflictDoNothing()
      .returning({ id: contentPages.id });
    documents += result.length;
  }

  return { collections, records, documents };
}

/** True when the estate is empty, so boot can say something useful. */
export async function isEmpty(db: Database): Promise<boolean> {
  const result = (await db.execute(
    sql`select count(*)::int as count from content_pages`,
  )) as { rows?: Array<{ count: number }> } | Array<{ count: number }>;
  const rows = Array.isArray(result) ? result : (result.rows ?? []);
  return (rows[0]?.count ?? 0) === 0;
}
