# Durable signal for submission processor dispatch failures (#1747)

**Issue:** [#1747](https://github.com/govtech-bb/gov-bb/issues/1747) — bug,
area:backend, subsystem:api, severity:important.

## What changed

`SubmissionProcessorListener` used to catch dispatch errors in both the
SQS-enqueue path and the direct in-process path, log them, and move on. The
submission's state was never touched, so a submission whose downstream
processors all failed to dispatch still read `SUBMITTED` — the failure existed
only as a log line, with no queryable state to detect or retry it.

Now the listener accumulates the failed processor **snapshot indices** across
both `catch` blocks and, after the loop, persists them via a new
`FormSubmissionRepository.markProcessorsFailed(submissionId, failedIndices)`.
The signal lands in a new nullable `processors_failed` jsonb column on
`form_submissions` (entity in `@govtech-bb/database`, added by migration
`1781200000000`). `null` = all entries dispatched (or none ran); a non-empty
array names exactly the indices a reconciliation/retry job should re-dispatch.

## Why it looks the way it does

**Per-index list, not a coarse status flip.** A submission dispatches N
processors, so partial failure ("3 of 5 enqueued") is a real state. Flipping
status to `ERROR`/`DELIVERY_ERROR` would lose *which* and *how many* entries
failed and is awkward when some succeeded. The index array is precise and
directly retryable — and matches the issue's own `markProcessorsFailed(id,
failures[])` worked example. The indices are the frozen `processors[]` snapshot
positions already used as the stable `${submissionId}:${index}` dispatch key,
so they map straight back to the entries that need re-dispatch.

**`null` on success, not `[]`.** We write nothing on the success path, leaving
the column `null`. That is the simplest "all dispatched" representation and is
already the value for every pre-existing row, so no backfill is needed. The
guard `if (failures.length > 0)` keeps the success path free of a database
write.

**`jsonb`, not Postgres `int[]`.** Every column in `@govtech-bb/database` uses
`jsonb`; there are zero array-typed columns in the package. Matching the
established convention beat introducing a new column type for one field.

**Collect-then-commit.** Failures are pushed to a local `failures: number[]`
during the loop and saved in a single `update` after it — one database round
trip regardless of how many entries failed, instead of writing inside each
`catch`.

## Scope held

No retry/reconciliation job, no dashboards/alerts, and no success-side
`COMPLETE` marker — this change only records the failure signal so it is
observable and retryable later. The `COMPLETE`/`ERROR`/`PROCESSING` enum values
remain unwritten on the async path, exactly as before.

## Verification

`nx run-many -t build --projects=database,api` clean. `database:test` 19 pass;
listener + repo specs 26 pass. Full `api:test` 932 pass — the only 4 failures
are pre-existing migration *smoke* tests needing a live Postgres
(`ECONNREFUSED 127.0.0.1:5432`), untouched by this change.
