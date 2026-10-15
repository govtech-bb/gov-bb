# api_v2: the estate import is a compiled command, run once per environment (#2978)

## Context

On `v2-rewrite` the converter (`pnpm seed-data` → `src/seed-data/estate.json`) and `seed()` already existed, and `main.ts` ran `seed()` at boot when `SEED=true`. #2978 asked for a safe way to load the markdown estate into each deployed `api_v2` database exactly once, and then to stop treating the markdown as the source of truth. The session opened with four agents arguing the approach (findings on the issue); all four converged on the same shape once the deployed facts were checked.

## What we did

- `524b4542` — `estate.json` records `source`, the last commit that touched `apps/landing/src/content`; the zod schema requires it.
- `e0b37a7e`, `58ff810d` — `seed(db, actor)` and `importEstate(db, { dryRun, force })` in `src/seed.ts`: one locked transaction, refusal with an actor histogram, `--force` truncates `search_chunks`/`content_pages`/`categories`, dry run rolls back.
- `c425d4d8` — `src/import-estate.ts`, compiled into the image as `dist/src/import-estate.js`; `pnpm import-estate` locally; an e2e spec that runs the compiled process on a scratch database.
- `f08f1ecf`, `5e72ea0b` — README: `SEED` is local-only, and the "Importing the estate (one-time)" runbook.
- Follow-up #3052 (infra): drop `SEED=true` from the sandbox task definition, later refuse `SEED` in production.
- Recorded as [ADR 0077](../decisions/0077-deployed-content-databases-are-loaded-once-then-written-only-by-the-editor.md): a deployed content database is loaded once, then written only by the editor.

## Why we did it that way

- **A command in the image, not a migration, a workflow or a boot flag.** The issue already ruled out a migration (test template database, schema history, stale copy, replay). The remaining choice was decided by what the deployed environment actually offers: the image ships `dist/` and production `node_modules` only (no `tsx`, no `scripts/`, no `psql`, no markdown), the GitHub deploy role can push to ECR and roll the service but cannot `run-task`, and `PowerUserAccess` lacks `iam:PassRole`. ECS Exec is enabled on the service. So the only thing that runs everywhere without an infra change is a file under `src/` that the normal build compiles, started by Exec inside the live container with the API's own secrets.
- **The committed snapshot, regenerated before each import, rather than reading markdown at run time.** The image has no markdown, so the command imports `estate.json`. The runbook therefore starts with "merge `main`, run `pnpm seed-data`, commit, deploy", and `source` is written so history names the markdown commit rather than the deploy. The snapshot on this branch is still `v2-rewrite`'s (48 landing files behind `main`); the real refresh happens before each environment's import.
- **`--force` means replace, not re-add.** The user chose this over an additive `on conflict do nothing` force, because additive re-seeding is the exact defect the issue describes (it resurrects deleted pages). Replace is allowed only when the dry run's histogram shows machine actors (`seed`, `spike`); if an editor has written, the runbook says fix forward or use RDS point-in-time recovery. `change_events` is never truncated (it is append-only by trigger anyway), so a replace is itself recorded.
- **The dry run is the real transaction rolled back.** A counting-only path would report counts the real run might not reproduce. Rolling back the full import gives real counts and real errors; the rollback is caught as `TransactionRollbackError`, the same pattern as `PostgresPages.atomically`.
- **`seed()` was not atomic.** It committed per page and autocommitted categories, so "reuse `seed()` in one transaction" meant teaching it to take a transaction handle and an actor, not wrapping it. The import also takes `share row exclusive` on `content_pages` so an editor write cannot land between the count and the inserts.
- **Actor `import:<sha>` (plus ` force: <reason>`)** answers the issue's open question and is composed inside `importEstate()` from `ESTATE.source`; the CLI has nothing else to pass.
- **Sandbox is not empty.** The sandbox task definition sets `SEED=true` with `NODE_ENV=production`, so sandbox already holds the snapshot and re-adds deleted pages on every boot. The sandbox step is therefore a rehearsal of `--force`, and removing `SEED` is an alpha-infra change (#3052) the user's token cannot reach. A `config.ts` refusal of `SEED` in production was dropped from this scope for the same reason.
- **The runbook opens an interactive `/bin/sh` via Exec.** `--command` is not shell-parsed, so a reason with spaces would be split; the `/bin/sh -c '…'` one-liner is shown as an alternative to confirm on the rehearsal.
- **Freeze at the prod import, not now.** Until prod is imported, `apps/landing/src/content` stays editable and the snapshot is regenerated per environment.

## What we almost got wrong

- The issue's "empty database" premise did not hold for sandbox; proposals that skipped the task definition planned the wrong sandbox step.
- `--force` skipped the truncate when only categories remained, so stray category rows would have survived and been under-counted. Fixed in `58ff810d`.
- Task 1's snapshot-integrity test passes on the current data; it was proven live by corrupting a category and watching it fail, rather than trusted.
- `pnpm --filter … import-estate -- --dry-run` fails: this pnpm forwards the literal `--` to `tsx`. The README omits the separator.

## Open questions

- A 40-hex actor is accurate but not readable in the editor's history view; a display mapping may be wanted later.
- Smoking `preview` urls needs the task's `PREVIEW_SECRET`; the runbook covers `public` only.
- Pages that list two categories (only `calculate-severance-pay` today) still take the first.
- Whether landing (and later landing_v2) cuts over to the API per environment at the moment of import, or both read paths stay live for a while.
