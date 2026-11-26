/**
 * Run `pnpm db:generate` after schema changes. Triggers and functions need
 * custom SQL migrations (`pnpm db:generate --custom`).
 *
 * Constraint names must match existing databases: adapters use them to
 * identify violations. The `auth_*` property keys are BetterAuth's field names.
 *
 * `content_pages.body_markdown` is the page body, stored as written; the site
 * sanitises and renders it. The block document of
 * ADR 0123 returns as a later change.
 */

import {
  boolean,
  bigint,
  check,
  customType,
  index,
  integer,
  uniqueIndex,
  foreignKey,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ROLES } from "./modules/permissions";
import type { CollectionSchema, RecordData } from "./modules/collection";
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
  "unpublished",
  "submitted",
  "rejected",
  "approved",
  "discarded",
]);

/**
 * Edit versions for pages, categories and collection records, from one
 * sequence so no two rows share one. `version` crosses the wire as a number,
 * hence the cap.
 */
export const contentEditVersionSeq = pgSequence("content_edit_version_seq", {
  maxValue: Number.MAX_SAFE_INTEGER,
});

/** The order audit events were inserted in, whatever their timestamps say. */
export const changeEventOrderSeq = pgSequence("change_event_order_seq", {
  maxValue: Number.MAX_SAFE_INTEGER,
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
    .notNull()
    .defaultNow(),
};

export const categories = pgTable(
  "categories",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    slug: varchar("slug", { length: 100 })
      .notNull()
      .unique("categories_slug_key"),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    // A subcategory is a category with a parent.
    parentId: uuid("parent_id"),
    // The order the site lists categories (and a category's subcategories) in.
    position: integer("position").notNull().default(0),
    version: bigint("version", { mode: "number" })
      .notNull()
      .default(sql`nextval('content_edit_version_seq')`),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "categories_parent_id_fkey",
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
  ],
);

export const contentPages = pgTable(
  "content_pages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`)
      .$type<PageId>(),
    url: varchar("url", { length: 512 })
      .notNull()
      .unique("content_pages_url_key"),
    slug: varchar("slug", { length: 200 }).notNull(),
    // Null for an uncategorised page, which lives at the root.
    categoryId: uuid("category_id"),
    // Null for a page at the root of its category: what the category lists.
    parentId: uuid("parent_id").$type<PageId>(),
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
    // When the content last changed; set by `touch_content_updated_at()`.
    contentUpdatedAt: timestamp("content_updated_at", {
      withTimezone: true,
      precision: 3,
    })
      .notNull()
      .defaultNow(),
    version: bigint("version", { mode: "number" })
      .notNull()
      .default(sql`nextval('content_edit_version_seq')`),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "content_pages_category_id_fkey",
      columns: [table.categoryId],
      foreignColumns: [categories.id],
    }).onDelete("restrict"),
    // Checks the parent exists for an uncategorised page too, which the
    // composite key below (MATCH SIMPLE) skips when `category_id` is null.
    foreignKey({
      name: "content_pages_parent_id_fkey",
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
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

/** Page redirect paths survive deletion and recreation of their destination pages. */
export const pageRedirects = pgTable(
  "page_redirects",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sourceUrl: varchar("source_url", { length: 512 }).notNull(),
    destinationUrl: varchar("destination_url", { length: 512 }).notNull(),
  },
  (table) => [
    unique("page_redirects_source_url_unique").on(table.sourceUrl),
    check(
      "page_redirects_not_self",
      sql`${table.sourceUrl} <> ${table.destinationUrl}`,
    ),
    index("page_redirects_destination_url_idx").on(table.destinationUrl),
  ],
);

/**
 * BetterAuth's tables, as BetterAuth 1.7.7 generates them: quoted camelCase
 * columns, its own timestamp precision and `CURRENT_TIMESTAMP` defaults.
 * `system` is the user with no account, which `0001_triggers` inserts.
 */
export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique("auth_user_email_key"),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique("auth_session_token_key"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId").notNull(),
  },
  (table) => [
    foreignKey({
      name: "auth_session_userId_fkey",
      columns: [table.userId],
      foreignColumns: [authUser.id],
    }).onDelete("cascade"),
    index("auth_session_userId_idx").on(table.userId),
  ],
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId").notNull(),
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
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "auth_account_userId_fkey",
      columns: [table.userId],
      foreignColumns: [authUser.id],
    }).onDelete("cascade"),
    index("auth_account_userId_idx").on(table.userId),
  ],
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
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
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
    pageId: uuid("page_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    heading: text("heading"),
    body: text("body").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(heading, '') || ' ' || body)`,
    ),
  },
  (table) => [
    foreignKey({
      name: "search_chunks_page_id_fkey",
      columns: [table.pageId],
      foreignColumns: [contentPages.id],
    }).onDelete("cascade"),
    unique("search_chunks_page_id_ordinal_key").on(table.pageId, table.ordinal),
    index("search_chunks_tsv_idx").using("gin", table.tsv),
  ],
);

/**
 * Append-only, enforced by a trigger rather than by convention. The database
 * writes a row on every change to a content table (`record_change`) and on
 * each review step of a page's revision (`record_review`), both in
 * `migrations/0001_triggers.sql`, which is what a live-update feed would read
 * from. `actor` is the user whose transaction
 * made the change, or `system`.
 *
 * The snapshot is the row that changed, so its shape follows the action, not
 * just `entity_kind`: a page's `submitted`, `rejected` and `approved` events
 * hold a `page_revisions` row (its `id` is the revision's; `page_id` is the
 * page), while its other events hold a `content_pages` row. Rebuilding a
 * page's state means filtering on action.
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
    // Ordered inserts under the content lock; null on events older than the column.
    eventOrder: bigint("event_order", { mode: "number" }).default(
      sql`nextval('change_event_order_seq')`,
    ),
    action: changeAction("action").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    // Null for history written before format labels were introduced.
    snapshotVersion: integer("snapshot_version").default(1),
    actor: text("actor").notNull().default("system"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    // The version a restore brought back (ADR 0135); null on every other event.
    restoredFrom: integer("restored_from"),
  },
  (table) => [
    // A user with history cannot be deleted, so an event never loses its author.
    foreignKey({
      name: "change_events_actor_fkey",
      columns: [table.actor],
      foreignColumns: [authUser.id],
    }).onDelete("restrict"),
    uniqueIndex("change_events_event_order_unique").on(table.eventOrder),
    unique("change_events_entity_kind_entity_id_version_no_key").on(
      table.entityKind,
      table.entityId,
      table.versionNo,
    ),
  ],
);

/** Persistent audit counters survive deletion and recreation of their content entity. */
export const changeEventCounters = pgTable(
  "change_event_counters",
  {
    entityKind: varchar("entity_kind", { length: 40 }).notNull(),
    entityId: text("entity_id").notNull(),
    lastVersion: integer("last_version").notNull(),
  },
  (table) => [
    primaryKey({
      name: "change_event_counters_pkey",
      columns: [table.entityKind, table.entityId],
    }),
  ],
);

/** An employee's roles, a row each; they go with their user. */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    // The admin who granted it; null when api_v2 granted it itself: admin
    // and editor from API_V2_ADMIN_EMAILS, or the default editor role that
    // first sign-in granted before #3412.
    grantedBy: text("granted_by"),
    grantedAt: timestamp("granted_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "user_roles_pkey",
      columns: [table.userId, table.role],
    }),
    foreignKey({
      name: "user_roles_user_id_fkey",
      columns: [table.userId],
      foreignColumns: [authUser.id],
    }).onDelete("cascade"),
    check(
      "user_roles_role_check",
      sql`${table.role} in (${sql.raw(ROLES.map((role) => `'${role}'`).join(", "))})`,
    ),
  ],
);

/**
 * A change to a public page waiting for an approver; the live row is
 * unchanged until it is published. A page has at most one open revision, a
 * draft or a submitted one; rejected and published revisions are kept.
 */
export const pageRevisions = pgTable(
  "page_revisions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    pageId: uuid("page_id").notNull().$type<PageId>(),
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
    // Everyone who saved to it; none of them may approve it (ADR 0134).
    contributors: text("contributors").array().notNull(),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      precision: 3,
    }),
    // Who rejected or published it, and when.
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true, precision: 3 }),
    // Why it was rejected.
    comment: text("comment"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "page_revisions_page_id_fkey",
      columns: [table.pageId],
      foreignColumns: [contentPages.id],
    }).onDelete("cascade"),
    check(
      "page_revisions_status_check",
      sql`${table.status} in ('draft', 'submitted', 'rejected', 'published', 'discarded')`,
    ),
    uniqueIndex("page_revisions_open_page_id_key")
      .on(table.pageId)
      .where(sql`status in ('draft', 'submitted')`),
  ],
);

/**
 * Facts many pages repeat, kept once (#3183). `schema` is the field list a
 * record is checked against; a developer sets it, editors change records.
 */
export const dataCollections = pgTable("data_collections", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 })
    .notNull()
    .unique("data_collections_key_key"),
  title: varchar("title", { length: 200 }).notNull(),
  // The field whose value names a record, as `collection_records.record_key`.
  recordKey: varchar("record_key", { length: 100 }).notNull(),
  schema: jsonb("schema").$type<CollectionSchema>().notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  ...timestamps,
});

/** One record of a collection; a collection with records cannot be deleted. */
export const collectionRecords = pgTable(
  "collection_records",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    collectionKey: varchar("collection_key", { length: 100 }).notNull(),
    recordKey: varchar("record_key", { length: 200 }).notNull(),
    data: jsonb("data").$type<RecordData>().notNull(),
    version: bigint("version", { mode: "number" })
      .notNull()
      .default(sql`nextval('content_edit_version_seq')`),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "collection_records_collection_key_fkey",
      columns: [table.collectionKey],
      foreignColumns: [dataCollections.key],
    }).onDelete("restrict"),
    unique("collection_records_collection_key_record_key_key").on(
      table.collectionKey,
      table.recordKey,
    ),
  ],
);
