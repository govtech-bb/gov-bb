/**
 * The Drizzle schema, matching migrations `001_init` to `008_user_roles`
 * applied in order, table for table and column for column. BetterAuth reads
 * and writes its four `auth_*` tables through these definitions; their
 * property keys are BetterAuth's field names.
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
  boolean,
  check,
  customType,
  index,
  integer,
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
import { VISIBILITIES, type Frontmatter, type PageId } from "./modules/page";

export const pageVisibility = pgEnum("page_visibility", VISIBILITIES);

export const changeAction = pgEnum("change_action", [
  "created",
  "updated",
  "published",
  "reverted",
  "deleted",
  "unpublished",
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

/**
 * BetterAuth's tables, as `003_auth` creates them: quoted camelCase columns
 * and BetterAuth's own timestamp precision. `system` is the user with no
 * account.
 */
export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (table) => [index("auth_session_userId_idx").on(table.userId)],
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  },
  (table) => [index("auth_account_userId_idx").on(table.userId)],
);

export const authVerification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("auth_verification_identifier_idx").on(table.identifier)],
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
 * Append-only, enforced by a trigger rather than by convention. The database
 * writes a row on every change to a content table (`record_change`, see
 * `007_change_history_trigger`), which is what a live-update feed would read
 * from. `actor` is the user whose transaction made the change, or `system`.
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
    actor: text("actor")
      .notNull()
      .default("system")
      .references(() => authUser.id, { onDelete: "restrict" }),
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
    // The admin who granted it; null when it came from API_V2_ADMIN_EMAILS.
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
