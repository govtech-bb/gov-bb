import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";
import { EMBED_DIMS } from "../rag/embed";

// pgvector extension must exist before the tables are created. drizzle-kit
// doesn't emit extension DDL, so the migrator runs this sentinel first.
export const ENABLE_PGVECTOR = sql`CREATE EXTENSION IF NOT EXISTS vector`;

// Content taxonomy, matched to what `@govtech-bb/content` actually produces
// today. The corpus is a single entity type — `ServiceEntity` — so every
// document is a "service". (The old app's ministry/department/state-body/form
// kinds were stale: the /government/organisations corpus was deleted and the
// chunker only ever emitted these. Kept as single-/two-member unions so the
// column stays explicit and extensible if other content rejoins later.)
export type DocumentKind = "service";

// Per service the chunker emits one synthetic "intent" chunk (title +
// description folded into a question, for retrieval matching) and N "section"
// chunks (body split on heading hierarchy). Service-specific fields
// (visibility, formId, category, subcategory, serviceType, hasStartPage,
// publishDate, sourceUrl) ride in documents.metadata, not as columns.
export type ChunkKind = "intent" | "section";

export const documents = pgTable(
  "documents",
  {
    id: text().primaryKey(),
    kind: text().$type<DocumentKind>().notNull(),
    slug: text().notNull(),
    title: text().notNull(),
    url: text().notNull(),
    sourceUrl: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    payloadHash: text().notNull(),
    embeddingModel: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_kind_idx").on(t.kind)],
);

export const chunks = pgTable(
  "chunks",
  {
    id: text().primaryKey(),
    documentId: text().notNull(),
    kind: text().$type<ChunkKind>().notNull(),
    chunkIndex: integer().notNull(),
    text: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>(),
    embedHash: text().notNull(),
    embedding: vector({ dimensions: EMBED_DIMS }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.documentId],
      foreignColumns: [documents.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("chunks_embedding_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops"))
      .with({ m: 16, ef_construction: 64 }),
    index("chunks_document_id_idx").on(t.documentId),
    index("chunks_kind_idx").on(t.kind),
  ],
);

export const ingestRuns = pgTable("ingest_runs", {
  id: text().primaryKey(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp({ withTimezone: true }),
  status: text().notNull(), // running | success | failed
  summary: jsonb().$type<Record<string, unknown>>(),
  errorMessage: text(),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
export type IngestRun = typeof ingestRuns.$inferSelect;
export type NewIngestRun = typeof ingestRuns.$inferInsert;
