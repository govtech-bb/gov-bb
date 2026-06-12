# 0053 — Spreadsheet export assumes a single writer per file

**Date:** 2026-06-12
**Status:** Accepted — builds on
[ADR 0031](0031-submission-processors-dispatch-per-entry.md) (per-entry dispatch
and the `${submissionId}:${index}` dedup token)

## Context

`SpreadsheetProcessor.processEntry` records each submission as a row in a
recipe-supplied `<filename>.xlsx` via a read-modify-write:
`readFile → in-memory dedup scan → addRow → writeFile`. The SQS consumer
(`SqsConsumerService.pollQueue`) processes a received batch with
`Promise.all(...processMessage)`, so several messages run **concurrently in one
process**. Two messages whose entries resolve to the same file can both
`readFile` before either `writeFile`s; the second write clobbers the first — a
lost row ([#702](https://github.com/govtech-bb/gov-bb/issues/702)).

The composite `${submissionId}:${index}` dedup token from
[ADR 0031](0031-submission-processors-dispatch-per-entry.md) made *retries* safe
and removed false-dedup between sibling entries, but it does **not** make
concurrent *first*-writes safe — the racing reads simply don't see each other's
not-yet-written token.

Two classes of fix were available:

- **In-process serialization** — a per-resolved-path lock inside the processor
  (the provider is a NestJS singleton, so one map is shared across the batch).
  Closes the race *within* a process.
- **Cross-process safety** — an EFS/OS file lock or an atomic append store.
  Closes the race even when *separate processes* write the same file.

The deployment topology today is **single-writer-per-file**: a given `.xlsx` is
only ever written by one process (one task, or a per-task local export dir). No
two processes contend for the same file.

## Decision

**Spreadsheet export files have a single-writer-per-file topology, and
in-process serialization is therefore sufficient.**

- `SpreadsheetProcessor` carries a private `Map<filePath, Promise>` keyed on the
  **resolved** `filePath` (post-`basename`/`join`). `withFileLock(filePath, fn)`
  chains each call onto the prior call for the *same* path, running the entire
  `readFile → dedup scan → addRow → writeFile` critical section under the lock.
  Same-file calls serialize in arrival order; different files stay fully
  parallel.
- The chain advances on the prior turn's **settlement** (success *or* failure),
  so a throwing turn propagates to its own caller — which the consumer relies on
  to NACK and let SQS retry — but never breaks the chain for the next waiter.
- We deliberately **do not** add cross-process locking. It is unnecessary under
  single-writer topology and out of scope for a `severity:minor` bug.

## Consequences

- **The lost-update race is closed in-process.** Concurrent appends to the same
  file each observe prior writes; no write clobbers another.
- **The single-writer assumption is load-bearing.** If the deployment ever lets
  **multiple processes/tasks write the same export file** — most plausibly a
  *shared* EFS export dir across tasks — this in-process lock becomes
  necessary-but-not-sufficient, and the race returns silently (no code change,
  no test failure). Such an infra change **must** be paired with a cross-process
  strategy (file lock or atomic append store). This constraint is recorded in
  the NOTE comment in `spreadsheet.processor.ts` and tracked against #702.
- **No change to the on-disk format or the dedup grain.** The
  `${submissionId}:${index}` token and `submissionRef` column from ADR 0031 are
  untouched; this decision only governs *who* may write a file and *how* writes
  are ordered.
