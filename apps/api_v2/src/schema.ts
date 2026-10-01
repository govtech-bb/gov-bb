/**
 * The Drizzle schema, matching migrations `001_init` and `002_markdown_pages`
 * applied in order, table for table and column for column.
 *
 * The DDL in `migrations/` stays the source of truth and this file is the
 * typed view of it that queries are written against. `schema.test.ts` asserts
 * the two agree.
 *
 * `content_pages.body_markdown` is the source; `hast` is compiled from it on
 * every write (see `markdown.ts`), so a read never parses markdown. The block
 * document of ADR 0074 returns as a later change.
 */

import {
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
import type { Root } from "hast";

export const pageVisibility = pgEnum("page_visibility", [
  "public",
  "preview",
  "draft",
]);

export type Visibility = (typeof pageVisibility.enumValues)[number];

export const changeAction = pgEnum("change_action", [
  "created",
  "updated",
  "published",
  "reverted",
  "deleted",
]);

/**
 * What is left of a page's frontmatter once the fields with columns of their
 * own are taken out: title, description, category, visibility and form_id
 * are columns so filters and the form gate need no JSON lookup, and are not
 * repeated here.
 */
export interface Frontmatter {
  lede?: string;
  subcategory?: string;
  stage?: string;
  featured?: boolean;
  section?: string;
  service_type?: string;
  keywords?: string[];
  source_url?: string;
}

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
  ...timestamps,
});

/**
 * Only what the site needs to gate a Start button: whether the form is
 * public. The recipe itself stays with the forms API.
 */
export const forms = pgTable("forms", {
  formId: varchar("form_id", { length: 100 }).primaryKey(),
  visibility: pageVisibility("visibility").notNull().default("draft"),
});

export const contentPages = pgTable("content_pages", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  url: varchar("url", { length: 512 }).notNull().unique(),
  slug: varchar("slug", { length: 200 }).notNull(),
  // Null for an uncategorised page, which lives at the root.
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "restrict",
  }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  visibility: pageVisibility("visibility").notNull().default("draft"),
  // An FK, so a page cannot name a form the database has never heard of.
  formId: varchar("form_id", { length: 100 }).references(() => forms.formId, {
    onDelete: "restrict",
  }),
  bodyMarkdown: text("body_markdown").notNull(),
  hast: jsonb("hast").$type<Root>().notNull(),
  frontmatter: jsonb("frontmatter")
    .$type<Frontmatter>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 }),
  ...timestamps,
});

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
