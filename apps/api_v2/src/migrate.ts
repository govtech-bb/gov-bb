/**
 * The migration runner.
 *
 * Deliberately small: a numbered migration module, a table recording what has
 * run, and each one executed as one script. `drizzle-kit generate` would
 * normally emit the SQL; for the spike the DDL is hand-written because it has
 * to stay identical to the block editor spike's `001_init`, which is the
 * version that has actually been exercised in a browser.
 *
 * The runner takes an `exec` rather than using `db.execute`, because a
 * migration is a *script* and `db.execute` sends one statement through the
 * extended query protocol — a multi-statement file fails there with 42601.
 * Each driver supplies its own simple-query path: `pool.query` for
 * node-postgres, `client.exec` for PGlite. That difference is real, so it is
 * a parameter rather than something hidden behind a clever helper.
 */

import { sql } from "drizzle-orm";
import { SQL as INIT_SQL } from "./migrations/001_init";
import type { Database } from "./store";

const SCRIPTS: Record<string, string> = { "001_init": INIT_SQL };

export const MIGRATIONS = ["001_init"] as const;

/** Runs a whole SQL script, statements and all. */
export type Exec = (script: string) => Promise<unknown>;

export function readMigration(name: string): string {
  const script = SCRIPTS[name];
  if (!script) throw new Error(`No migration named ${name}`);
  return script;
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
