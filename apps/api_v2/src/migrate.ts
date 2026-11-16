/**
 * The migration runner: Drizzle's migrator, run at boot.
 *
 * `migrations/` holds what `pnpm db:generate` writes from `schema.ts`, and
 * hand-written SQL for what a Drizzle schema cannot describe (triggers,
 * functions, data fixes). Drizzle records what has run in
 * `drizzle.__drizzle_migrations` and applies the rest in one transaction, so
 * a boot lands every pending migration or none of them.
 *
 * Drizzle's migrator takes no lock, so two instances booting together would
 * both apply the same migration. Here they take turns: the run holds an
 * advisory lock on the one connection it uses.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as applyPending } from "drizzle-orm/node-postgres/migrator";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

/** Beside `src` in a checkout and beside `dist/src` in the build, which copies it. */
export const MIGRATIONS_FOLDER = join(__dirname, "..", "migrations");

const Journal = z.object({
  entries: z.array(z.object({ tag: z.string(), when: z.number() })),
});

/** The migrations in the order they apply, as drizzle-kit's journal lists them. */
export function readJournal() {
  const journal = readFileSync(
    join(MIGRATIONS_FOLDER, "meta", "_journal.json"),
    "utf8",
  );
  return Journal.parse(JSON.parse(journal)).entries;
}

/** Serialises instances that boot together; released when its connection ends. */
const LOCK = "select pg_advisory_lock(hashtext('api_v2 migrations'))";

/** The last migration of the hand-written runner this one replaced. */
const LEGACY_HEAD = "026_change_event_order";
/** How many of ours build what that runner's 26 left: the baseline and its triggers. */
const LEGACY_EQUIVALENT = 2;

/**
 * Hands a database the previous runner migrated over to Drizzle. Its tables
 * already hold everything our first migrations create, so those are recorded
 * as applied instead of run. `schema_migrations` stays, so a rollback to the
 * previous runner finds its own work done instead of replaying it over live
 * content.
 *
 * Delete this once every database has booted on it, and drop
 * `schema_migrations` in a migration when no release can roll back that far.
 */
async function adoptLegacyDatabase(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ legacy: boolean; adopted: boolean }>(
    `select to_regclass('schema_migrations') is not null as legacy,
            to_regclass('drizzle.__drizzle_migrations') is not null as adopted`,
  );
  if (!rows[0]?.legacy || rows[0].adopted) return;

  const head = await client.query(
    "select 1 from schema_migrations where name = $1",
    [LEGACY_HEAD],
  );
  if (head.rowCount === 0)
    throw new Error(
      `This database's migrations stop before ${LEGACY_HEAD}. Boot the last ` +
        "release that had hand-written migrations on it first, or recreate it.",
    );

  const baseline = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER })
    .slice(0, LEGACY_EQUIVALENT)
    .map(({ hash, folderMillis }) => `('${hash}', ${folderMillis})`);
  // One script is one transaction, so the ledger never exists without its
  // rows. The table is as drizzle-orm creates it.
  await client.query(`
    create schema if not exists drizzle;
    create table drizzle.__drizzle_migrations (
      id serial primary key, hash text not null, created_at bigint
    );
    insert into drizzle.__drizzle_migrations (hash, created_at)
      values ${baseline.join(", ")};`);
}

/** The journal time of the newest migration Drizzle has recorded; 0 for none. */
async function lastApplied(client: PoolClient): Promise<number> {
  const ledger = await client.query<{ exists: boolean }>(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as exists",
  );
  if (!ledger.rows[0]?.exists) return 0;
  const { rows } = await client.query<{ at: string | null }>(
    "select max(created_at) as at from drizzle.__drizzle_migrations",
  );
  return Number(rows[0]?.at ?? 0);
}

/**
 * Apply the pending migrations and name them. The pool's query limits apply,
 * so a caller serving requests migrates on a pool with a limit of its own.
 */
export async function migrate(pool: Pool): Promise<string[]> {
  const journal = readJournal();
  const client = await pool.connect();
  try {
    await client.query(LOCK);
    await adoptLegacyDatabase(client);
    // Drizzle applies whatever the journal dates after the newest it recorded.
    const applied = await lastApplied(client);
    await applyPending(drizzle(client), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    return journal.filter(({ when }) => when > applied).map(({ tag }) => tag);
  } finally {
    // Not back to the pool: ending the session is what releases the lock,
    // and takes with it anything a failed run left open.
    client.release(true);
  }
}
