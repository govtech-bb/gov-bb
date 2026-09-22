import type { PGliteInterface } from "@electric-sql/pglite";
import { COLLECTIONS, RECORDS_BY_COLLECTION } from "./seed-data/collections";
import { DOCUMENTS } from "./seed-data/documents";

/**
 * Loads the collections, their records and the page documents.
 *
 * Every insert is `on conflict do nothing`, so this inserts what is missing
 * and never touches what is already there — editor changes to a seeded page
 * survive a reload, because the row already exists and the insert is a
 * no-op.
 *
 * It deliberately does NOT bail out when `content_pages` is already
 * populated. That guard was here, and it meant a page added to the seed
 * never reached a database that had been seeded before: the developer added
 * a page, reloaded, and saw the old four — with no error and nothing to
 * suggest the seed had been skipped entirely. Inserting what is missing is
 * both idempotent and additive.
 *
 * The tradeoff, stated plainly: deleting a seeded page in the editor and
 * reloading brings it back, because "missing" and "deliberately removed"
 * look identical from here. Distinguishing them needs a record of what has
 * been seeded, which is a real feature and not worth building in a spike —
 * `reset()` is the way back to a clean slate.
 *
 * @returns whether anything was actually inserted.
 */
export async function seed(db: PGliteInterface): Promise<boolean> {
  let inserted = 0;

  for (const collection of COLLECTIONS) {
    const result = await db.query(
      `insert into data_collections (key, title, record_key, schema)
       values ($1, $2, $3, $4)
       on conflict (key) do nothing`,
      [
        collection.key,
        collection.title,
        collection.record_key,
        JSON.stringify(collection.schema),
      ],
    );
    inserted += result.affectedRows ?? 0;

    const records = RECORDS_BY_COLLECTION[collection.key] ?? [];
    for (const record of records) {
      const recordResult = await db.query(
        `insert into collection_records (collection_key, record_key, data)
         values ($1, $2, $3)
         on conflict (collection_key, record_key) do nothing`,
        [collection.key, record.record_key, JSON.stringify(record.data)],
      );
      inserted += recordResult.affectedRows ?? 0;
    }
  }

  for (const doc of DOCUMENTS) {
    const result = await db.query(
      `insert into content_pages
         (url, slug, schema_name, document_type, title, description, is_draft, body)
       values ($1, $2, $3::page_schema_name, $4, $5, $6, $7, $8)
       on conflict (url) do nothing`,
      [
        doc.url,
        doc.slug,
        doc.schema_name,
        doc.document_type,
        doc.title,
        doc.description,
        doc.is_draft,
        JSON.stringify(doc.body),
      ],
    );
    inserted += result.affectedRows ?? 0;
  }

  return inserted > 0;
}
