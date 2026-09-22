import type { PGliteInterface } from "@electric-sql/pglite";
import { COLLECTIONS, RECORDS_BY_COLLECTION } from "./seed-data/collections";
import { DOCUMENTS } from "./seed-data/documents";

/**
 * Loads the collections, their records and the page documents — but only
 * when `content_pages` is empty, so reloading the app never duplicates
 * anything and never clobbers edits made in the editor.
 */
export async function seed(db: PGliteInterface): Promise<boolean> {
  const existing = await db.query<{ count: string }>(
    "select count(*)::text as count from content_pages",
  );
  if (Number(existing.rows[0].count) > 0) return false;

  for (const collection of COLLECTIONS) {
    await db.query(
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

    const records = RECORDS_BY_COLLECTION[collection.key] ?? [];
    for (const record of records) {
      await db.query(
        `insert into collection_records (collection_key, record_key, data)
         values ($1, $2, $3)
         on conflict (collection_key, record_key) do nothing`,
        [collection.key, record.record_key, JSON.stringify(record.data)],
      );
    }
  }

  for (const doc of DOCUMENTS) {
    await db.query(
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
  }

  return true;
}
