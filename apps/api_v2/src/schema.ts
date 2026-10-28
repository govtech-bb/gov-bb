/**
 * The Drizzle schema, matching migrations `001_init` to `010_page_revisions`
 * applied in order, table for table and column for column. BetterAuth's
 * `auth_*` tables are its own and are not mapped here.
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
  check,
  customType,
  index,
  integer,
  uniqueIndex,
  foreignKey,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ROLES } from "./modules/auth";
import {
  REVISION_STATUSES,
  VISIBILITIES,
  type Frontmatter,
  type PageFields,
  type PageId,
} from "./modules/page";

export const pageVisibility = pgEnum("page_visibility", VISIBILITIES);

export const changeAction = pgEnum("change_action", [
  "created",
  "updated",
  "published",
  "reverted",
  "deleted",
]);

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
 * An employee's roles, a row each. `user_id` references `auth_user`, which
 * BetterAuth owns, so the key is in the migration only.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    // The admin who granted it; null when api_v2 granted it itself: the
    // default editor role, or admin from API_V2_ADMIN_EMAILS.
    grantedBy: text("granted_by"),
    grantedAt: timestamp("granted_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    check(
      "user_roles_role_check",
      sql`${table.role} in ('editor', 'approver', 'admin')`,
    ),
  ],
);

/**
 * A change to a public page waiting for an approver; the live row is
 * unchanged until it is published. A page has at most one open revision.
 */
export const pageRevisions = pgTable(
  "page_revisions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    pageId: uuid("page_id")
      .notNull()
      .references(() => contentPages.id, { onDelete: "cascade" })
      .$type<PageId>(),
    status: text("status", { enum: REVISION_STATUSES })
      .notNull()
      .default("draft"),
    fields: jsonb("fields").$type<PageFields>().notNull(),
    // The live page's version this revision was last saved over.
    liveUpdatedAt: timestamp("live_updated_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    createdBy: text("created_by").notNull(),
    // Everyone who saved to it; none of them may approve it (ADR 0079).
    contributors: text("contributors").array().notNull(),
    ...timestamps,
  },
  (table) => [
    check("page_revisions_status_check", sql`${table.status} in ('draft')`),
    uniqueIndex("page_revisions_open_page_id_key")
      .on(table.pageId)
      .where(sql`status = 'draft'`),
  ],
);
