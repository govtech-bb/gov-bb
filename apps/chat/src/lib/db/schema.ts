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

// pgvector extension must exist before the table is created. Drizzle-kit
// doesn't generate extension DDL automatically, so we keep a sentinel SQL
// the migrator runs before applying migrations.
export const ENABLE_PGVECTOR = sql`CREATE EXTENSION IF NOT EXISTS vector`;

// --------------------------------------------------------------------------
// Schema — documents + chunks + ingest_runs. See docs/plans/rag-pipeline-v2.md.
// --------------------------------------------------------------------------

export type DocumentKind =
  | "ministry"
  | "department"
  | "state-body"
  | "service"
  | "form";

export type ChunkKind =
  | "name"
  | "minister"
  | "head"
  | "contact"
  | "body"
  | "intent"
  | "section"
  | "form";

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
