/**
 * Every query in the spike lives behind this interface. No React component
 * issues SQL — the point being that no consumer knows whether it is talking
 * to PGlite in the browser or, later, to `ApiStore` issuing the same SQL
 * server-side.
 */

import type { PGliteInterface } from "@electric-sql/pglite";
import {
  validateDocument,
  type CollectionDefinition,
  type PageDocument,
  type SchemaName,
  type ValidationError,
} from "@govtech-bb/block-kit";

export interface DocumentSummary {
  id: string;
  url: string;
  title: string;
  schema_name: SchemaName;
  updated_at: string;
}

export interface DocumentStore {
  list(): Promise<DocumentSummary[]>;
  get(id: string): Promise<PageDocument | null>;
  save(doc: PageDocument, ifUpdatedAt: string | null): Promise<PageDocument>;
  delete(id: string): Promise<void>;
}

/** Thrown when `save` matched no row: someone else changed it first. */
export class ConflictError extends Error {
  constructor(readonly documentId: string) {
    super(
      "This page was changed somewhere else since you opened it. Reload to see the current version.",
    );
    this.name = "ConflictError";
  }
}

/** Thrown when a document fails any of the nine rules. */
export class ValidationFailedError extends Error {
  constructor(readonly errors: ValidationError[]) {
    super(`${errors.length} validation error(s)`);
    this.name = "ValidationFailedError";
  }
}

const SELECT_DOC = `
  select 1 as version, id::text as id, url, slug, schema_name, document_type,
         title, description, is_draft, body, updated_at::text as updated_at
    from content_pages
`;

export class PgliteStore implements DocumentStore {
  constructor(private readonly db: PGliteInterface) {}

  async list(): Promise<DocumentSummary[]> {
    const result = await this.db.query<DocumentSummary>(
      `select id::text as id, url, title, schema_name,
              updated_at::text as updated_at
         from content_pages
        order by url`,
    );
    return result.rows;
  }

  async get(id: string): Promise<PageDocument | null> {
    const result = await this.db.query<PageDocument>(
      `${SELECT_DOC} where id = $1::uuid`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async getByUrl(url: string): Promise<PageDocument | null> {
    const result = await this.db.query<PageDocument>(
      `${SELECT_DOC} where url = $1`,
      [url],
    );
    return result.rows[0] ?? null;
  }

  async listCollections(): Promise<CollectionDefinition[]> {
    const result = await this.db.query<CollectionDefinition>(
      `select key, title, record_key, schema from data_collections order by key`,
    );
    return result.rows;
  }

  async records(
    collectionKey: string,
  ): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.query<{ data: Record<string, unknown> }>(
      `select data from collection_records
        where collection_key = $1 and status = 'published'
        order by record_key`,
      [collectionKey],
    );
    return result.rows.map((row) => row.data);
  }

  /** The context the nine rules need, read fresh on every save. */
  private async validationContext() {
    const [collections, urls] = await Promise.all([
      this.listCollections(),
      this.db.query<{ url: string }>("select url from content_pages"),
    ]);
    return { collections, pageUrls: urls.rows.map((row) => row.url) };
  }

  async save(
    doc: PageDocument,
    ifUpdatedAt: string | null,
  ): Promise<PageDocument> {
    const errors = validateDocument(doc, await this.validationContext());
    if (errors.length > 0) throw new ValidationFailedError(errors);

    // Zero rows affected means someone else changed the row. One user in
    // one browser will rarely hit it, but the call sites, the error path
    // and the UI all exist from day one, so turning this on against a
    // server is nothing.
    const result = await this.db.query<PageDocument>(
      `update content_pages
          set url = $3, slug = $4, schema_name = $5::page_schema_name,
              document_type = $6, title = $7, description = $8,
              is_draft = $9, body = $10::jsonb, updated_at = now()
        where id = $1::uuid
          and ($2::timestamptz is null or updated_at = $2::timestamptz)
      returning 1 as version, id::text as id, url, slug, schema_name,
                document_type, title, description, is_draft, body,
                updated_at::text as updated_at`,
      [
        doc.id,
        ifUpdatedAt,
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

    if (result.rows.length === 0) throw new ConflictError(doc.id);
    const saved = result.rows[0];

    await this.appendChangeEvent(saved);
    return saved;
  }

  async delete(id: string): Promise<void> {
    await this.db.query("delete from content_pages where id = $1::uuid", [id]);
  }

  /**
   * Optional per the brief; it is cheap, and writing a row on every save is
   * what makes the append-only trigger something the spike exercises rather
   * than only declares.
   */
  private async appendChangeEvent(doc: PageDocument): Promise<void> {
    const next = await this.db.query<{ version_no: number }>(
      `select coalesce(max(version_no), 0) + 1 as version_no
         from change_events where entity_kind = 'content_page' and entity_id = $1`,
      [doc.id],
    );
    await this.db.query(
      `insert into change_events
         (entity_kind, entity_id, version_no, action, snapshot)
       values ('content_page', $1, $2, 'updated', $3::jsonb)`,
      [doc.id, next.rows[0].version_no, JSON.stringify(doc)],
    );
  }
}
