/**
 * The Drizzle schema, matching `packages/spike-db`'s migration `001_init`
 * table for table and column for column.
 *
 * That migration is the one the block editor spike proved: it runs unmodified
 * in PGlite (Postgres 17 in WASM) in the browser and in a real Postgres 15+.
 * Defining it twice is a risk, so the SQL in `migrations/001_init.sql` stays
 * the source of truth for the DDL and this file is the typed view of it that
 * queries are written against. `schema.test.ts` asserts the two agree.
 *
 * Note this is NOT the ERD on #2698, which has `content_pages.body_markdown`.
 * See `docs/spikes/2026-09-api-v2-plan.md` for why the block document won:
 * markdown cannot express a data reference, cannot be validated against the
 * estate, and smuggles presentation in as hand-written HTML.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Body, SchemaName } from "@govtech-bb/block-kit/document";

export const pageSchemaName = pgEnum("page_schema_name", [
  "answer",
  "guide",
  "transaction",
  "finder",
  "calendar",
]);

export const recordStatus = pgEnum("record_status", ["draft", "published"]);

export const changeAction = pgEnum("change_action", [
  "created",
  "updated",
  "published",
  "reverted",
  "deleted",
]);

export const contentPages = pgTable("content_pages", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  url: varchar("url", { length: 512 }).notNull().unique(),
  slug: varchar("slug", { length: 200 }).notNull(),
  schemaName: pageSchemaName("schema_name").$type<SchemaName>().notNull(),
  documentType: varchar("document_type", { length: 60 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  isDraft: boolean("is_draft").notNull().default(false),
  // The whole point: `{version, blocks, refs}`, not a markdown string.
  body: jsonb("body").$type<Body>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
});

export const dataCollections = pgTable("data_collections", {
  key: varchar("key", { length: 100 }).primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  recordKey: varchar("record_key", { length: 100 }).notNull(),
  schema: jsonb("schema").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
});

export const collectionRecords = pgTable(
  "collection_records",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    collectionKey: varchar("collection_key", { length: 100 })
      .notNull()
      .references(() => dataCollections.key, { onDelete: "restrict" }),
    recordKey: varchar("record_key", { length: 200 }).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    status: recordStatus("status").notNull().default("published"),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("collection_records_collection_key_record_key_key").on(
      table.collectionKey,
      table.recordKey,
    ),
    index("collection_records_data_idx").using(
      "gin",
      sql`${table.data} jsonb_path_ops`,
    ),
  ],
);

/**
 * Append-only, enforced by a trigger rather than by convention. The spike
 * writes a row on every save, which is what makes the trigger something the
 * tests exercise rather than only declare — and what an SSE feed of live
 * updates would read from.
 */
export const changeEvents = pgTable(
  "change_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    entityKind: varchar("entity_kind", { length: 40 }).notNull(),
    entityId: text("entity_id").notNull(),
    versionNo: integer("version_no").notNull(),
    action: changeAction("action").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    actor: text("actor").notNull().default("spike"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("change_events_entity_kind_entity_id_version_no_key").on(
      table.entityKind,
      table.entityId,
      table.versionNo,
    ),
  ],
);
