/**
 * The migration runner.
 *
 * Deliberately small: a numbered SQL file per migration, a table recording
 * what has run, and each file executed as one script. `drizzle-kit generate`
 * would normally emit the SQL; for the spike the DDL is hand-written because
 * it has to stay identical to `packages/spike-db`'s `001_init`, which is the
 * version that has actually been exercised in a browser.
 *
 * The runner takes an `exec` rather than using `db.execute`, because a
 * migration is a *script* and `db.execute` sends one statement through the
 * extended query protocol — a multi-statement file fails there with 42601.
 * Each driver supplies its own simple-query path: `pool.query` for
 * node-postgres, `client.exec` for PGlite. That difference is real, so it is
 * a parameter rather than something hidden behind a clever helper.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import type { Database } from "./store";

const here = dirname(fileURLToPath(import.meta.url));

export const MIGRATIONS = ["001_init"] as const;

/** Runs a whole SQL script, statements and all. */
export type Exec = (script: string) => Promise<unknown>;

export function readMigration(name: string): string {
  return readFileSync(join(here, "migrations", `${name}.sql`), "utf8");
}

export async function migrate(db: Database, exec: Exec): Promise<string[]> {
  await exec(
    `create table if not exists schema_migrations (
       name       text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  /*
   * `execute` is typed per driver — node-postgres hands back a QueryResult
   * with `.rows`, PGlite hands back the array itself.
   */
  const applied = (await db.execute(
    sql`select name from schema_migrations`,
  )) as { rows?: Array<{ name: string }> } | Array<{ name: string }>;
  const rows = Array.isArray(applied) ? applied : (applied.rows ?? []);
  const done = new Set(rows.map((row) => row.name));

  const ran: string[] = [];
  for (const name of MIGRATIONS) {
    if (done.has(name)) continue;
    await exec(readMigration(name));
    await db.execute(
      sql`insert into schema_migrations (name) values (${name})`,
    );
    ran.push(name);
  }
  return ran;
}
