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
 * The caller supplies the simple-query path: `pool.query`.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import { SQL as INIT_SQL } from "./migrations/001_init";
import { SQL as MARKDOWN_PAGES_SQL } from "./migrations/002_markdown_pages";
import { SQL as AUTH_SQL } from "./migrations/003_auth";
import { SQL as GITHUB_SESSIONS_SQL } from "./migrations/004_github_sessions";
import { SQL as HIERARCHY_SQL } from "./migrations/005_hierarchy_and_search";
import type { Database } from "./db";

/** The migrations, in the order they apply. Each is idempotent by rule. */
const MIGRATIONS = [
  ["001_init", INIT_SQL],
  ["002_markdown_pages", MARKDOWN_PAGES_SQL],
  ["003_auth", AUTH_SQL],
  ["004_github_sessions", GITHUB_SESSIONS_SQL],
  ["005_hierarchy_and_search", HIERARCHY_SQL],
] as const;

/** Serialises instances that boot together; released when its transaction ends. */
const LOCK = "select pg_advisory_xact_lock(hashtext('api_v2 migrations'));";

/** Runs a whole SQL script, statements and all, as one implicit transaction. */
export type Exec = (script: string) => Promise<unknown>;

/** Apply pending SQL scripts in their existing order, without touching authored content. */
export async function migrate(db: Database, exec: Exec): Promise<string[]> {
  await exec(`${LOCK}
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );`);

  const applied = await db.execute(sql`select name from schema_migrations`);
  const rows = z.array(z.object({ name: z.string() })).parse(applied.rows);
  const done = new Set(rows.map((row) => row.name));

  const ran: string[] = [];
  for (const [name, script] of MIGRATIONS) {
    if (done.has(name)) continue;
    // The script and its record commit together. An instance that loses the
    // race for the lock re-runs an idempotent script and records nothing new.
    await exec(`${LOCK}
${script}
insert into schema_migrations (name) values ('${name}') on conflict do nothing;`);
    ran.push(name);
  }
  return ran;
}
