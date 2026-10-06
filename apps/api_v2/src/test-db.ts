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
import type { Database } from "./store";
import * as schema from "./schema";

export async function createTestDb(): Promise<{
  db: Database;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  // PGlite's simple-query path, which is what a multi-statement script needs.
  await migrate(db, (script) => client.exec(script));
  return { db, close: () => client.close() };
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
