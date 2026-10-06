/**
 * A real Postgres for the tests, in-process.
 *
 * PGlite is Postgres 17 compiled to WASM, so the migration runs unmodified
 * and the constraints, the enums and the append-only trigger are all
 * genuinely exercised — none of which a mock would do. It also means
 * `nx run api-v2:test` needs no database, no docker and no `DB_*` variables,
 * which is what keeps the tests runnable in CI and on a plane.
 *
 * The one thing it does not prove is that the SQL works against RDS over
 * TLS. That is a deploy-time acceptance criterion on #2700 and needs #2707.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "./migrate";
import { buildApp, type AppOptions } from "./app";
import { type Employee } from "./modules/auth";
import { ok } from "./modules/result";
import { EditorAccess, type SessionReader } from "./services/editor-access";
import { ApiStore, type Database } from "./store";
import * as schema from "./schema";

/** Compose the real SQL driver and migrations in memory. */
export async function createTestDb(): Promise<{
  db: Database;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db: Database = drizzle(client, { schema });
  // PGlite's simple-query path, which is what a multi-statement script needs.
  await migrate(db, (script) => client.exec(script));
  return { db, close: () => client.close() };
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
  options: Partial<Pick<AppOptions, "auth" | "config" | "logger">> & {
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
