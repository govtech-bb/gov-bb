# 0031 — Submission processors dispatch one SQS message per entry

**Date:** 2026-06-03
**Status:** Accepted — supersedes the **dispatch** decision of
[ADR 0006](0006-submission-processors-iterate-internally.md)

## Context

[ADR 0006](0006-submission-processors-iterate-internally.md) made submission
processors fan out **by type, not by config entry**: one SQS message per
processor *type*, and each handler iterated internally over every matching
`payload.processors` entry. That unblocked multi-instance authoring with a
minimal change, but deliberately traded away isolation (#94 → #95):

- A failure on the second email retries the whole `email` batch and can re-send
  the first email.
- One slow entry holds its siblings under the same visibility timeout.
- The DLQ records the *type* that failed, not the *entry*.

Issue [#95](https://github.com/govtech-bb/gov-bb/issues/95) asks for per-entry
retry/dead-lettering isolation. Two ways to identify an entry on the wire were
considered:

- **Positional `processorIndex`** — the integer index of the one entry a
  message addresses within the submission's frozen `processors[]` snapshot
  (which the message already serialises in full).
- **Persisted `id` on `Processor`** — a stable id minted by the builder at
  author time, added to the schema in `@govtech-bb/form-types`.

## Decision

Non-gating processors fan out **by entry, not by type**. Each SQS message
carries a positional `processorIndex` addressing exactly one entry in the
frozen `processors[]` snapshot; the consumer runs
`payload.processors[processorIndex]` and nothing else.

- **Positional, not persisted.** A message only ever addresses the snapshot it
  was enqueued with, and its whole retry→DLQ life happens against that frozen
  array — there is no cross-form-version identity need, so we extend the
  `${submissionId}:${index}` positional grain already used for idempotency
  keys (ADR 0006) and recipe element identity on the wire
  ([ADR 0009](0009-form-builder-instance-ids-are-editor-only.md)) rather than
  pay for a schema change, builder id-minting, and back-compat. Revisit only if
  a future feature needs durable per-entry identity.
- **Dispatch by entry.** The listener loops over `resolvedPayload.processors`
  by index, resolves each entry's handler via `resolveByType`, skips
  unregistered types (warn) and gating handlers, and dispatches the rest with
  their index. Indices are snapshot positions, so skipped entries do **not**
  compact — keeping `${submissionId}:${index}` keys stable. `resolve` /
  `resolveSplit` now serve only the gating path in `submissions.service.ts`.
- **Index-only — no iterate-all fallback.** Handlers act on the single indexed
  entry; the queue is **drained at deploy**. A message with a missing or
  out-of-range `processorIndex` (a pre-drain/legacy or corrupted body) is
  deleted by a consumer guard rather than looped to the DLQ.
- **Per-entry idempotency re-evaluated:**
  - **email** — solved by construction: a retry re-runs only the failed entry,
    so siblings are never re-sent. (A single entry can still re-send itself —
    inherent to SES at-least-once; out of scope.)
  - **spreadsheet** — dedups on a composite `${submissionId}:${index}` token in
    a leading `submissionRef` column, so two entries writing the same file each
    dedup against their own prior write and retry safely.
  - **opencrvs** — unchanged; already `X-Idempotency-Key: ${submissionId}:${index}`.
  - **webhook** — now acts on the indexed entry (previously `.find()` — first
    only) and sets `X-Idempotency-Key: ${submissionId}:${index}` for parity.
- **Payment is unchanged.** It is gating, single-instance (first-wins), runs
  synchronously in `submissions.service.ts`, and is never enqueued. ADR 0006's
  gating exceptions stand.

## Consequences

- **Isolation.** Retry and dead-lettering are per entry: a flaky integration on
  one entry no longer corrupts delivery of its siblings, and the DLQ records the
  exact entry that failed.
- **Deploy requires a queue drain.** Because there is no iterate-all fallback,
  in-flight messages enqueued before the deploy have no `processorIndex` and are
  deleted by the consumer guard. Drain the queue at deploy (or accept that
  pre-deploy in-flight messages are dropped).
- **Message schema changed.** `SubmissionSqsMessage` carries `processorIndex`
  (body + a `Number` message attribute); `SubmissionCreatedEvent` carries an
  optional `processorIndex` set on every dispatch path (SQS + direct).
- **Spreadsheet layout changed.** Existing export files gain a new leading
  `submissionRef` column on the next write; the dedup scan reads that column.
- **New processor types.** Assume `process()` is invoked for exactly one entry,
  addressed by `processorIndex`. Read `payload.processors[processorIndex]`.
  Derive any idempotency key from `${submissionId}:${index}`.
