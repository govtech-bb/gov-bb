/**
 * The Drizzle schema, matching migrations `001_init` to `007_page_locks`
 * applied in order, table for table and column for column.
 *
 * The DDL in `migrations/` stays the source of truth and this file is the
 * typed view of it that queries are written against. `schema.test.ts` asserts
 * the two agree.
 *
 * `content_pages.body_markdown` is the page body, stored as written; the site
 * sanitises and renders it. The block document of
 * ADR 0074 returns as a later change.
 */

import {
  type AnyPgColumn,
  customType,
  index,
  integer,
  foreignKey,
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
import {
  VISIBILITIES,
  type DraftFields,
  type Frontmatter,
  type PageId,
} from "./modules/page";
import { CHANGE_ACTIONS } from "./modules/page-history";

export const pageVisibility = pgEnum("page_visibility", VISIBILITIES);

export const changeAction = pgEnum("change_action", CHANGE_ACTIONS);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
};

export const categories = pgTable("categories", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  // A subcategory is a category with a parent.
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
    onDelete: "restrict",
  }),
  // The order the site lists categories (and a category's subcategories) in.
  position: integer("position").notNull().default(0),
  ...timestamps,
});

export const contentPages = pgTable(
  "content_pages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .$type<PageId>(),
    url: varchar("url", { length: 512 }).notNull().unique(),
    slug: varchar("slug", { length: 200 }).notNull(),
    // Null for an uncategorised page, which lives at the root.
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    // Null for a page at the root of its category: what the category lists.
    parentId: uuid("parent_id")
      .references((): AnyPgColumn => contentPages.id, {
        onDelete: "restrict",
      })
      .$type<PageId>(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    visibility: pageVisibility("visibility").notNull().default("draft"),
    // A name in the forms API, which owns whether the form is open.
    formId: varchar("form_id", { length: 100 }),
    bodyMarkdown: text("body_markdown").notNull(),
    frontmatter: jsonb("frontmatter")
      .$type<Frontmatter>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      precision: 3,
    }),
    ...timestamps,
  },
  (table) => [
    unique("content_pages_id_category_id_key").on(table.id, table.categoryId),
    // A sub-page shares its parent's category, and follows it when it moves.
    foreignKey({
      name: "content_pages_parent_category_fkey",
      columns: [table.parentId, table.categoryId],
      foreignColumns: [table.id, table.categoryId],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    index("content_pages_parent_id_idx").on(table.parentId),
    index("content_pages_category_id_idx").on(table.categoryId),
  ],
);

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

/**
 * A page's body split at its headings, as the plain text search indexes.
 * Rebuilt with the page on every save; `tsv` is generated from it.
 */
export const searchChunks = pgTable(
  "search_chunks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    pageId: uuid("page_id")
      .notNull()
      .references(() => contentPages.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    heading: text("heading"),
    body: text("body").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(heading, '') || ' ' || body)`,
    ),
  },
  (table) => [
    unique("search_chunks_page_id_ordinal_key").on(table.pageId, table.ordinal),
    index("search_chunks_tsv_idx").using("gin", table.tsv),
  ],
);

/**
 * Append-only, enforced by a trigger rather than by convention. A row is
 * written on every save, which is what makes the trigger something the tests
 * exercise rather than only declare — and what a live-update feed would read
 * from.
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

/**
 * Each page's working copy, until it is published or discarded (migration
 * 006). The site never reads it.
 */
export const pageDrafts = pgTable("page_drafts", {
  pageId: uuid("page_id")
    .primaryKey()
    .references(() => contentPages.id, { onDelete: "cascade" })
    .$type<PageId>(),
  draft: jsonb("draft").$type<DraftFields>().notNull(),
  baseUpdatedAt: timestamp("base_updated_at", {
    withTimezone: true,
    precision: 3,
  }).notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
});

/** Who is editing each page (migration 007); a claim lapses five minutes after it was last touched. */
export const pageLocks = pgTable("page_locks", {
  pageId: uuid("page_id")
    .primaryKey()
    .references(() => contentPages.id, { onDelete: "cascade" })
    .$type<PageId>(),
  holderId: text("holder_id").notNull(),
  holderName: text("holder_name").notNull(),
  holderEmail: text("holder_email").notNull(),
  touchedAt: timestamp("touched_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
});

/** BetterAuth's users (migration 003), as far as the change log names its actors. */
export const authUsers = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
});
