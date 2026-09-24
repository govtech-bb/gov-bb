/**
 * Every query lives here, behind the operations the block editor spike's
 * `DocumentStore` declares. That interface was written with a comment saying
 * no consumer should know "whether it is talking to PGlite in the browser or,
 * later, to `ApiStore` issuing the same SQL server-side". This is the
 * server-side half.
 *
 * The important consequence is that `validateDocument` runs HERE. In the
 * spike it ran only in the browser, which made the rules advisory — anyone
 * could POST whatever they liked. A rule that is not enforced where the data
 * lands is documentation, not a rule.
 */

import {
  validateDocument,
  type CollectionDefinition,
  type PageDocument,
  type SchemaName,
  type ValidationError,
} from "@govtech-bb/block-kit/document";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  changeEvents,
  collectionRecords,
  contentPages,
  dataCollections,
} from "./schema";

/** Either driver: `node-postgres` in production, PGlite under test. */
export type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export interface DocumentSummary {
  id: string;
  url: string;
  title: string;
  schema_name: SchemaName;
  document_type: string;
  updated_at: string;
}

/** `save` matched no row: someone else changed it first. */
export class ConflictError extends Error {
  constructor(readonly documentId: string) {
    super(
      "This page was changed somewhere else since you opened it. Reload to see the current version.",
    );
    this.name = "ConflictError";
  }
}

/** A document failed one or more of the nine rules. */
export class ValidationFailedError extends Error {
  constructor(readonly errors: ValidationError[]) {
    super(`${errors.length} validation error(s)`);
    this.name = "ValidationFailedError";
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(what);
    this.name = "NotFoundError";
  }
}

type PageRow = typeof contentPages.$inferSelect;

/**
 * Columns are camelCase in Drizzle and snake_case on the wire, because the
 * wire format is `PageDocument` and the editor already speaks it. Converting
 * here keeps the mapping in exactly one place.
 */
const toDocument = (row: PageRow): PageDocument => ({
  version: 1,
  id: row.id,
  url: row.url,
  slug: row.slug,
  schema_name: row.schemaName,
  document_type: row.documentType,
  title: row.title,
  description: row.description,
  is_draft: row.isDraft,
  body: row.body,
  updated_at: row.updatedAt.toISOString(),
});

export class ApiStore {
  constructor(private readonly db: Database) {}

  async list(includeDrafts = false): Promise<DocumentSummary[]> {
    const rows = await this.db
      .select({
        id: contentPages.id,
        url: contentPages.url,
        title: contentPages.title,
        schemaName: contentPages.schemaName,
        documentType: contentPages.documentType,
        updatedAt: contentPages.updatedAt,
        isDraft: contentPages.isDraft,
      })
      .from(contentPages)
      .orderBy(asc(contentPages.url));

    return rows
      .filter((row) => includeDrafts || !row.isDraft)
      .map((row) => ({
        id: row.id,
        url: row.url,
        title: row.title,
        schema_name: row.schemaName,
        document_type: row.documentType,
        updated_at: row.updatedAt.toISOString(),
      }));
  }

  async get(id: string): Promise<PageDocument | null> {
    const rows = await this.db
      .select()
      .from(contentPages)
      .where(eq(contentPages.id, id));
    return rows[0] ? toDocument(rows[0]) : null;
  }

  async getByUrl(url: string): Promise<PageDocument | null> {
    const rows = await this.db
      .select()
      .from(contentPages)
      .where(eq(contentPages.url, url));
    return rows[0] ? toDocument(rows[0]) : null;
  }

  async listCollections(): Promise<CollectionDefinition[]> {
    const rows = await this.db
      .select()
      .from(dataCollections)
      .orderBy(asc(dataCollections.key));
    return rows.map((row) => ({
      key: row.key,
      title: row.title,
      record_key: row.recordKey,
      schema: row.schema as CollectionDefinition["schema"],
    }));
  }

  async records(
    collectionKey: string,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.recordRows(collectionKey);
    return rows.map((row) => row.data);
  }

  /** Records with their keys, for editing rather than rendering. */
  async recordRows(
    collectionKey: string,
  ): Promise<Array<{ record_key: string; data: Record<string, unknown> }>> {
    const rows = await this.db
      .select({
        recordKey: collectionRecords.recordKey,
        data: collectionRecords.data,
      })
      .from(collectionRecords)
      .where(
        and(
          eq(collectionRecords.collectionKey, collectionKey),
          eq(collectionRecords.status, "published"),
        ),
      )
      .orderBy(asc(collectionRecords.recordKey));
    return rows.map((row) => ({ record_key: row.recordKey, data: row.data }));
  }

  /** The context the nine rules need, read fresh on every save. */
  private async validationContext() {
    const [collections, urls] = await Promise.all([
      this.listCollections(),
      this.db.select({ url: contentPages.url }).from(contentPages),
    ]);
    return { collections, pageUrls: urls.map((row) => row.url) };
  }

  async save(
    doc: PageDocument,
    ifUpdatedAt: string | null,
  ): Promise<PageDocument> {
    const errors = validateDocument(doc, await this.validationContext());
    if (errors.length > 0) throw new ValidationFailedError(errors);

    const values = {
      url: doc.url,
      slug: doc.slug,
      schemaName: doc.schema_name,
      documentType: doc.document_type,
      title: doc.title,
      description: doc.description,
      isDraft: doc.is_draft,
      body: doc.body,
      updatedAt: new Date(),
    };

    // Zero rows affected means someone else changed the row first. Expressed
    // as two shapes rather than one clever predicate: a caller that has never
    // read the row passes null and means "I accept whatever is there".
    const where = ifUpdatedAt
      ? and(
          eq(contentPages.id, doc.id),
          eq(contentPages.updatedAt, new Date(ifUpdatedAt)),
        )
      : eq(contentPages.id, doc.id);

    const updated = await this.db
      .update(contentPages)
      .set(values)
      .where(where)
      .returning();

    if (updated.length === 0) {
      // Distinguish "gone" from "changed underneath you": a 404 and a 409 are
      // different problems and the editor says different things about them.
      const exists = await this.get(doc.id);
      if (!exists) throw new NotFoundError(`No document with id ${doc.id}`);
      throw new ConflictError(doc.id);
    }

    const saved = toDocument(updated[0]);
    await this.appendChangeEvent(saved);
    return saved;
  }

  async create(doc: Omit<PageDocument, "updated_at">): Promise<PageDocument> {
    const full: PageDocument = {
      ...doc,
      updated_at: new Date().toISOString(),
    };
    const errors = validateDocument(full, await this.validationContext());
    if (errors.length > 0) throw new ValidationFailedError(errors);

    const inserted = await this.db
      .insert(contentPages)
      .values({
        id: doc.id,
        url: doc.url,
        slug: doc.slug,
        schemaName: doc.schema_name,
        documentType: doc.document_type,
        title: doc.title,
        description: doc.description,
        isDraft: doc.is_draft,
        body: doc.body,
      })
      .returning();

    const saved = toDocument(inserted[0]);
    await this.appendChangeEvent(saved, "created");
    return saved;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(contentPages).where(eq(contentPages.id, id));
  }

  /**
   * A cheap token for "has anything changed".
   *
   * `change_events` is append-only and gets a row on every write, so its
   * count plus its newest timestamp identify the state of the whole estate
   * without reading any of it. Clients poll this and refetch only when it
   * moves.
   */
  async version(): Promise<{ count: number; latest: string | null }> {
    const [row] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        latest: sql<string | null>`max(${changeEvents.occurredAt})::text`,
      })
      .from(changeEvents);
    return { count: Number(row?.count ?? 0), latest: row?.latest ?? null };
  }

  async saveRecord(
    collectionKey: string,
    recordKey: string,
    data: Record<string, unknown>,
    previousKey?: string,
  ): Promise<void> {
    if (previousKey && previousKey !== recordKey) {
      await this.deleteRecord(collectionKey, previousKey);
    }
    await this.db
      .insert(collectionRecords)
      .values({ collectionKey, recordKey, data })
      .onConflictDoUpdate({
        target: [collectionRecords.collectionKey, collectionRecords.recordKey],
        set: { data, updatedAt: new Date() },
      });
    await this.appendCollectionEvent(collectionKey);
  }

  async deleteRecord(collectionKey: string, recordKey: string): Promise<void> {
    await this.db
      .delete(collectionRecords)
      .where(
        and(
          eq(collectionRecords.collectionKey, collectionKey),
          eq(collectionRecords.recordKey, recordKey),
        ),
      );
    await this.appendCollectionEvent(collectionKey);
  }

  /**
   * A collection's records changing is an event too. Without this, editing a
   * holiday rule would reach the calendar only on a reload, while editing the
   * prose beside it arrived immediately — the same edit feeling live or not
   * depending on which half of the page it touched.
   */
  private async appendCollectionEvent(collectionKey: string): Promise<void> {
    const [next] = await this.db
      .select({
        versionNo: sql<number>`coalesce(max(${changeEvents.versionNo}), 0) + 1`,
      })
      .from(changeEvents)
      .where(
        and(
          eq(changeEvents.entityKind, "collection"),
          eq(changeEvents.entityId, collectionKey),
        ),
      );

    await this.db.insert(changeEvents).values({
      entityKind: "collection",
      entityId: collectionKey,
      versionNo: Number(next?.versionNo ?? 1),
      action: "updated",
      snapshot: { collection: collectionKey },
    });
  }

  private async appendChangeEvent(
    doc: PageDocument,
    action: "created" | "updated" = "updated",
  ): Promise<void> {
    const [next] = await this.db
      .select({
        versionNo: sql<number>`coalesce(max(${changeEvents.versionNo}), 0) + 1`,
      })
      .from(changeEvents)
      .where(
        and(
          eq(changeEvents.entityKind, "content_page"),
          eq(changeEvents.entityId, doc.id),
        ),
      );

    await this.db.insert(changeEvents).values({
      entityKind: "content_page",
      entityId: doc.id,
      versionNo: Number(next?.versionNo ?? 1),
      action,
      snapshot: doc,
    });
  }
}
