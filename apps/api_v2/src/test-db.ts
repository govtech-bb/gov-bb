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
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { inject } from "vitest";
import { buildApp, type AppOptions } from "./app";
import { type Employee } from "./modules/auth";
import { ok } from "./modules/result";
import { EditorAccess, type SessionReader } from "./services/editor-access";
import { ApiStore, type Database } from "./store";
import * as schema from "./schema";

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
  return {
    db: drizzle(pool, { schema }),
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

/** An employee fixture, never accepted by the production session adapter. */
export const TEST_EMPLOYEE: Employee = {
  id: "employee-test",
  email: "editor@govtech.bb",
  name: "Test editor",
};
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

/** Compose the production HTTP adapter with an explicit session test double. */
export function createTestApp(
  db: Database,
  options: Partial<
    Pick<AppOptions, "auth" | "config" | "logger" | "previewSecret">
  > & {
    sessions?: SessionReader;
  } = {},
) {
  return buildApp({
    store: new ApiStore(db),
    access: new EditorAccess(
      options.sessions ?? { findSession: async () => ok(TEST_EMPLOYEE) },
    ),
    auth: options.auth ?? {
      handle: async () =>
        Response.json({ error: "test_auth_not_configured" }, { status: 404 }),
    },
    config: options.config ?? TEST_HTTP_CONFIG,
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.previewSecret ? { previewSecret: options.previewSecret } : {}),
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
