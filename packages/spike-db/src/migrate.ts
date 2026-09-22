import type { PGliteInterface } from '@electric-sql/pglite'
import { MIGRATIONS } from './migrations'

/**
 * Applies any migration not already recorded. Idempotent: a second call on
 * the same database is a no-op, which is what makes "migration and seed run
 * on first load; a second load does not duplicate data" hold across reloads
 * as well as across tabs.
 */
export async function migrate(db: PGliteInterface): Promise<string[]> {
  await db.exec(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );
  `)

  const applied = await db.query<{ name: string }>(
    'select name from schema_migrations',
  )
  const done = new Set(applied.rows.map((row) => row.name))
  const ran: string[] = []

  for (const migration of MIGRATIONS) {
    if (done.has(migration.name)) continue
    // exec() runs a multi-statement script in one implicit transaction, so
    // a failure half way leaves no partial schema behind.
    await db.exec(migration.sql)
    await db.query('insert into schema_migrations (name) values ($1)', [
      migration.name,
    ])
    ran.push(migration.name)
  }

  return ran
}
