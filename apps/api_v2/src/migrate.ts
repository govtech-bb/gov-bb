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

/** Drizzle identifies pending migrations by timestamp, not filename. */
export function readJournal() {
  const journal = readFileSync(
    join(MIGRATIONS_FOLDER, "meta", "_journal.json"),
    "utf8",
  );
  return Journal.parse(JSON.parse(journal)).entries;
}

// Drizzle takes no lock; keep the old runner's key to serialize mixed-version boots.
const LOCK = "select pg_advisory_lock(hashtext('api_v2 migrations'))";

/** The last migration of the hand-written runner this one replaced. */
const LEGACY_HEAD = "026_change_event_order";
// The baseline and triggers replace legacy migrations 001 through 026.
const LEGACY_EQUIVALENT = 2;

/** Skip the baseline on legacy databases; keep their ledger for rollbacks. */
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
  // One implicit transaction: never leave an empty ledger that looks adopted.
  await client.query(`
    create schema if not exists drizzle;
    create table drizzle.__drizzle_migrations (
      id serial primary key, hash text not null, created_at bigint
    );
    insert into drizzle.__drizzle_migrations (hash, created_at)
      values ${baseline.join(", ")};`);
}

/** Recorded journal times, including entries absent from an older release. */
async function readAppliedMigrationTimes(
  client: PoolClient,
): Promise<Set<number>> {
  const ledger = await client.query<{ exists: boolean }>(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as exists",
  );
  if (!ledger.rows[0]?.exists) return new Set();
  const { rows } = await client.query<{ created_at: string }>(
    "select created_at from drizzle.__drizzle_migrations",
  );
  return new Set(rows.map(({ created_at }) => Number(created_at)));
}

/** Apply pending migrations in one transaction, using the pool's query limits. */
export async function migrate(pool: Pool): Promise<string[]> {
  const journal = readJournal();
  const client = await pool.connect();
  try {
    await client.query(LOCK);
    await adoptLegacyDatabase(client);
    const applied = await readAppliedMigrationTimes(client);
    const latest = Math.max(0, ...applied);
    const skipped = journal.find(
      ({ when }) => when <= latest && !applied.has(when),
    );
    if (skipped)
      throw Object.assign(
        new Error(
          `Migration journal would skip ${skipped.tag}; resolve the migration history before starting this release.`,
        ),
        { code: "MIGRATION_JOURNAL_GAP" },
      );
    await applyPending(drizzle(client), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    return journal.filter(({ when }) => when > latest).map(({ tag }) => tag);
  } finally {
    // Close the session to release its lock and any unfinished transaction.
    client.release(true);
  }
}
