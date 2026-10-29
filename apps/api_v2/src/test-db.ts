/**
 * A real Postgres for the tests: the same server and driver as production.
 *
 * The global setup migrates one template database per run; each test gets a
 * clone of it (`create database … template`), which copies files rather than
 * replaying the migrations, so a fresh database per test stays cheap. Clones
 * are dropped on close, and the setup's teardown drops whatever a crashed
 * test left behind.
 *
 * `DB_HOST` and friends default to a local Postgres. There is no skip: a
 * suite that passes because it ran nothing is worse than one that fails.
 */

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { inject } from "vitest";
import { PostgresCollections } from "./adapters/postgres-collections";
import { PostgresPages } from "./adapters/postgres-pages";
import { PostgresRoles } from "./adapters/postgres-roles";
import { buildApp, type AppOptions } from "./app";
import { ping, type Database } from "./db";
import { ROLES, UserId, type Employee } from "./modules/auth";
import { ok, type Result } from "./modules/result";
import { EditorAccess, type SessionReader } from "./services/editor-access";
import { EditorIndex } from "./services/editor-index";
import { CategoryEditing } from "./services/category-editing";
import { CollectionEditing } from "./services/collection-editing";
import { PageEditing } from "./services/page-editing";
import { PageResolution } from "./services/page-resolution";
import type { ReviewNotifier } from "./services/review-notifications";
import { SiteNavigation } from "./services/site-navigation";

declare module "vitest" {
  export interface ProvidedContext {
    /** The migrated database every test database is cloned from. */
    templateDatabase: string;
  }
}

/** Connection settings for the test server, without a database name. */
export const TEST_SERVER = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? "5432"),
  user: process.env.DB_USERNAME ?? "postgres",
  password: process.env.DB_PASSWORD ?? "postgres",
};

/** Run one statement against the server's maintenance database. */
export async function adminQuery(statement: string): Promise<unknown[]> {
  const client = new Client({
    ...TEST_SERVER,
    database: process.env.DB_ADMIN_NAME ?? "postgres",
  });
  await client.connect();
  try {
    return (await client.query(statement)).rows;
  } finally {
    await client.end();
  }
}

/** A test database: a drizzle handle, its pool, and how to throw it away. */
export interface TestDb {
  db: Database;
  pool: Pool;
  name: string;
  close: () => Promise<void>;
}

/** Prefix shared by every database one run creates, so teardown can sweep. */
export const runPrefix = (run: string) => `api_v2_t_${run}_`;

/**
 * A new database, empty or cloned from `template`. Names are generated hex,
 * so interpolating them into DDL (which cannot take parameters) is safe.
 */
export async function createDatabase(
  prefix: string,
  template?: string,
): Promise<TestDb> {
  const name = `${prefix}${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await adminQuery(
    template
      ? `create database ${name} template ${template} strategy file_copy`
      : `create database ${name}`,
  );
  const pool = new Pool({ ...TEST_SERVER, database: name });
  // pool.end() resolves before its idle clients disconnect, so close()'s
  // forced drop can terminate them (57P01); unheard, that is an uncaught error.
  pool.on("error", () => {});
  return {
    db: drizzle(pool),
    pool,
    name,
    close: async () => {
      await pool.end();
      await adminQuery(`drop database if exists ${name} with (force)`);
    },
  };
}

/** A migrated database of the test's own. */
export async function createTestDb(): Promise<TestDb> {
  const template = inject("templateDatabase");
  return createDatabase(template.replace(/template$/, ""), template);
}

/** An empty, unmigrated database, for tests of the migrations themselves. */
export async function createEmptyDb(): Promise<TestDb> {
  return createDatabase(inject("templateDatabase").replace(/template$/, ""));
}

/**
 * Content services that let an approver make public what they wrote, as
 * AUTH_BYPASS does: for setting up fixtures, and for tests about something
 * other than review (ADR 0079).
 */
export const SELF_APPROVAL = { allowSelfApproval: true } as const;

/** Compose the content services over a test database, as main.ts does over its pool. */
export function createTestServices(
  db: Database,
  review: ConstructorParameters<typeof PageEditing>[2] = {
    allowSelfApproval: false,
  },
  notifier?: ReviewNotifier,
) {
  const pages = new PostgresPages(db);
  return {
    resolution: new PageResolution(pages),
    navigation: new SiteNavigation(pages),
    editing: new PageEditing(pages, () => new Date(), review, notifier),
    index: new EditorIndex(pages),
    categories: new CategoryEditing(pages, () => new Date()),
    collections: new CollectionEditing(new PostgresCollections(db)),
  };
}

/** The value of a result a test expects to have succeeded. */
export function expectOk<T>(result: Result<T, Error>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

/** An employee fixture holding every role, never accepted by the production session adapter. */
export const TEST_EMPLOYEE: Employee = {
  id: UserId.parse("employee-test"),
  email: "editor@govtech.bb",
  name: "Test editor",
  roles: ROLES,
};
/** An employee who edits but neither approves nor administers. */
export const TEST_EDITOR: Employee = {
  id: UserId.parse("editor-test"),
  email: "editor-only@govtech.bb",
  name: "Test editor without approval",
  roles: ["editor"],
};

/** Make the fixtures users holding their roles, as a real sign-in and grants would. */
async function registerTestEmployees(db: Database) {
  for (const employee of [TEST_EMPLOYEE, TEST_EDITOR]) {
    await db.execute(
      sql`insert into auth_user (id, name, email, "emailVerified")
          values (${employee.id}, ${employee.name}, ${employee.email}, true)
          on conflict do nothing`,
    );
    for (const role of employee.roles)
      await db.execute(
        sql`insert into user_roles (user_id, role) values (${employee.id}, ${role})
            on conflict do nothing`,
      );
  }
}
/** Explicit origins used by HTTP integration tests. */
export const TEST_HTTP_CONFIG = {
  apiOrigin: "http://localhost:3020",
  editorOrigin: "http://localhost:3010",
};
/** A browser request to the authenticated editor routes. */
export const TEST_HEADERS = {
  cookie: "test-session=employee",
  origin: TEST_HTTP_CONFIG.editorOrigin,
};

/**
 * Compose the production HTTP adapter with an explicit session test double.
 * Roles are read from the database, where the fixtures hold theirs.
 */
export async function createTestApp(
  db: Database,
  options: Partial<
    Pick<AppOptions, "auth" | "config" | "logger" | "previewSecret" | "ready">
  > & {
    sessions?: SessionReader;
    /** Let an approver make public what they changed, as AUTH_BYPASS does. */
    allowSelfApproval?: boolean;
    /** Who hears of review steps; nobody by default, as with notifications off. */
    notifier?: ReviewNotifier;
  } = {},
) {
  await registerTestEmployees(db);
  const roles = new PostgresRoles(db);
  return buildApp({
    ...createTestServices(
      db,
      { allowSelfApproval: options.allowSelfApproval ?? false },
      options.notifier,
    ),
    access: new EditorAccess(
      options.sessions ?? { findSession: async () => ok(TEST_EMPLOYEE) },
      roles,
    ),
    roles,
    auth: options.auth ?? {
      handle: async () =>
        Response.json({ error: "test_auth_not_configured" }, { status: 404 }),
    },
    config: options.config ?? TEST_HTTP_CONFIG,
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.previewSecret ? { previewSecret: options.previewSecret } : {}),
    ready: options.ready ?? (() => ping(db)),
  });
}

/** A minimal valid page — the shape every write test starts from. */
export function aPage(overrides: Record<string, unknown> = {}) {
  return {
    url: "/money-financial-support/calculate-severance-pay",
    title: "Find out how much severance payment you are owed",
    description: null,
    visibility: "public" as const,
    body_markdown: "You should complete the calculator in one go.",
    ...overrides,
  };
}
