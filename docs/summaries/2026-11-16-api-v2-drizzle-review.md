# api_v2 Drizzle migration review follow-up

PR #3742, for #3316, replaces the hand-written runner with generated migrations.
The review follow-up keeps that design and adds the missing safeguards.

- A fresh database now records all 26 legacy migration names. Without them,
  rolling back to the old runner replayed `002_markdown_pages` and dropped
  collection records. Existing ledger rows are unchanged.
- The takeover fixture builds only the legacy baseline. Later migrations are
  applied by the runner rather than installed twice by the test.
- Startup refuses an unapplied journal entry older than the database head.
  A sorted journal alone did not catch that case.
- `createMigrationPool` owns the ten-minute driver and PostgreSQL query limits.
  An end-to-end test holds the migration lock beyond the request pool's five
  seconds and waits for the built server to start. It fails if `main.ts`
  accidentally passes the request pool to `migrate`.
- Rename-shaped schema drift now reports the generation command and retains
  the underlying prompt error. `drizzle-kit` is pinned to `0.31.10`; chat uses
  the same pin to satisfy the monorepo's dependency-version check.
- Proposed ADR 0139 records why preserving migration history replaces
  replay-safe DDL. The README and ERD header now agree with the proposal.
  #3316's scope is updated, with its original plan retained as history.

## Verification

- 1,072 API tests and 71 end-to-end tests passed against isolated PostgreSQL.
  The 24-project build passed with landing excluded and CI's editor origin.
  Typecheck, lint, formatting and dependency checks passed. Chat's suite had
  198 passes and 7 skips after aligning its Drizzle Kit pin.
- A temporary column addition generated SQL and passed all migration tests,
  including fresh setup and legacy takeover. The probe files were removed.
- Column and table rename probes failed with the actionable generation message.
- The boot timeout test failed with a deliberately substituted request pool,
  then passed after restoring the migration pool.
- The legacy and generated catalogs matched. The previous runner replayed
  zero migrations on a fresh database with the compatibility ledger, keeping
  its collection record.

## Deferred

#3747 tracks removal of legacy adoption after the rollback window closes.
#3748 tracks the full bidirectional catalog comparison. The ADR stays Proposed
until the PR is approved; no prior team consensus is assumed.
