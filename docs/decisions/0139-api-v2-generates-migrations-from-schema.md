# 0139. api_v2 generates migrations from schema.ts

**Date:** 2026-11-16
**Status:** Accepted in [PR #3742](https://github.com/govtech-bb/gov-bb/pull/3742)

## Context

[#3316](https://github.com/govtech-bb/gov-bb/issues/3316) chose hand-written,
replay-safe SQL as the source of truth. A July 2026 rollback had lost migration
bookkeeping without undoing DDL, causing duplicate-column errors on startup.
The issue proposed comparing the migrated database with the typed Drizzle
schema rather than generating migrations.

That leaves table definitions maintained twice. This proposal reverses that
choice: keep the typed `schema.ts` and generate table DDL from it. It does not
claim generated SQL is safe to replay. It makes preserving migration history
part of the deployment contract instead.

## Decision

- **`schema.ts` defines tables, keys, indexes, enums and sequences.** Generate
  SQL with `pnpm db:generate` and commit the SQL, snapshot and journal together.
  Triggers, functions and data fixes stay in custom SQL migrations. Review
  generated SQL before merging; generation is not permission to lose data.
- **SQL and its Drizzle ledger entries commit together.** The runtime applies
  all pending migrations in one transaction under the existing advisory lock.
  A failed batch rolls back; a committed batch is not replayed. Do not delete
  ledger rows to retry a deployment, or edit an applied migration. This replaces
  the requirement for every SQL statement to tolerate replay; it does not make
  lost or edited bookkeeping safe.
- **Code rollback preserves migration identity.** Restore the original SQL,
  snapshot and journal entry when reverting a code revert, rather than
  generating the same change under a new timestamp. Undo schema changes with a
  new migration. Legacy databases must have reached `026_change_event_order`
  before adoption. Keep their ledger, and populate it on fresh databases, so
  an older API cannot replay the scripts that drop collection tables.
- **An older, unapplied journal entry stops boot.** Drizzle itself would skip
  entries at or before its newest applied timestamp. Check every such entry
  against the ledger under the lock, and refuse missing ones. The journal's
  ordering test alone cannot detect a migration inserted before an entry that
  another database already applied.
- **Pin `drizzle-kit` to `0.31.10`.** Its undocumented `drizzle-kit/api` is used
  only in tests: `generateDrizzleJson` serializes the typed schema, and
  `generateMigration` compares it with the latest committed snapshot. This
  catches missing schema migrations, not every possible change made directly
  in custom SQL. The runtime uses `drizzle-orm`'s migrator, not this API.

## Consequences

- Renames may require an interactive Drizzle prompt. CI must fail with an
  instruction to run `pnpm db:generate` in a terminal, not guess whether a
  column was renamed or replaced. Simple differences still show their SQL.
- `pushSchema` and `pull` are not part of this workflow. The #3316 spikes found
  introspection and type-loss problems with them. Upgrading the pinned API
  requires rerunning the drift tests and a real generation rehearsal.
- The database role needs `CREATE` on the database on every boot, including
  when the `drizzle` schema already exists. Boot migrations use a dedicated
  pool with ten-minute driver and server query limits; requests keep five seconds.
- Adding an enum value and using it in SQL requires a commit boundary that
  this runner does not provide. Separate releases do not solve it for a
  database that skips the first release.
- Keep legacy adoption and `schema_migrations` until every database has
  upgraded **and** no permitted rollback uses the hand-written runner
  ([#3747](https://github.com/govtech-bb/gov-bb/issues/3747)).
  A full bidirectional catalog comparison remains separate work
  ([#3748](https://github.com/govtech-bb/gov-bb/issues/3748)). Trigger and function
  behaviour stays covered by PostgreSQL tests.
