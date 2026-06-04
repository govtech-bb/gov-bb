# 0006 — Submission processors iterate over their own matching configs

**Date:** 2026-05-22
**Status:** Accepted — the **dispatch** decision (one message per type, handlers
iterate internally) is **superseded** by
[ADR 0031](0031-submission-processors-dispatch-per-entry.md), which dispatches
one message per entry addressed by a positional `processorIndex`. The gating
exceptions below (payment first-wins) still stand.

## Context

A submission carries a `processors[]` array describing the integrations
that should run when the submission is created. Originally each
processor type was assumed to appear at most once per submission, so:

- `ProcessorFactory.resolve()` returned one handler instance per matching
  config entry (using `flatMap`), and the listener enqueued one SQS
  message per resolved handler.
- Each handler used `payload.processors.find(p => p.type === "...")` to
  pull its own config.

When the builder started letting authors add multiple processors of the
same type (e.g. two `email` recipients), both assumptions broke at
once. `resolve()` returned the *same* handler N times for N same-type
configs, so the listener enqueued N identical SQS messages — and each
consumer run used `.find()`, picking the *first* config every time.
Result: the first entry's work was duplicated N times and every
subsequent entry was silently dropped.

We considered two ways to fix this (tracked in #62):

- **Option A — Internal iteration.** Dedup at dispatch, iterate inside
  the handler. One SQS message per processor *type*, handler reads every
  matching entry from `payload.processors`.
- **Option B — Per-instance dispatch.** One SQS message per config
  entry, addressed by position or `id`. Gives independent retry/DLQ per
  entry but requires changes to the message schema, listener, consumer,
  and handler signatures.

## Decision

Submission processors fan out **by type, not by config entry**.

- `ProcessorFactory.resolve()` returns at most one handler per
  registered type that has ≥1 matching config (first-seen order).
- The listener enqueues one SQS message per processor *type*.
- Each handler reads `payload.processors`, filters down to its own type,
  and iterates over every matching entry.
- Per-entry failure modes (missing required config field, unresolved
  value) log a warning and skip *that entry*; the loop continues so
  other entries still run.
- Per-entry idempotency keys, where the downstream system supports them
  (e.g. OpenCRVS `X-Idempotency-Key`), are derived from
  `${submissionId}:${index}` so retries of one entry don't collide with
  another.

Two intentional exceptions to the iteration rule:

- **PaymentProcessor** keeps single-instance semantics. It has side
  effects that don't compose across multiple configs (creates a Payment
  row, initiates an EzPay session, gates the rest of the pipeline). It
  uses first-wins and emits a warning identifying the submission when
  more than one payment config is present.
- Processors that act on *external systems that can't deduplicate
  internally* may want a similar first-wins-with-warning policy. The
  default is iterate; opt out only with a documented reason.

Per-instance dispatch (Option B) is deferred to #95, motivated by
retry/DLQ isolation rather than feature unblock.

## Consequences

- **New processor types.** When adding a processor, assume `process()`
  may be invoked with multiple matching entries in `payload.processors`.
  Iterate by default. Log-and-skip on per-entry validation failures
  (don't throw the whole batch). Only deviate (first-wins-with-warning)
  if the operation has uncoordinated side effects, and document why.
- **Listener / consumer schema is stable.** The SQS message shape
  doesn't carry an index or per-config id — the handler is the source
  of truth for which entries it acts on. If #95 changes this, the
  message schema and consumer change together.
- **Retry semantics.** SQS retries the whole type's worth of work on
  failure. If one entry succeeds and another throws, the whole message
  re-runs; handlers that talk to external systems must rely on
  idempotency keys (per-entry where supported, per-submission otherwise)
  to make this safe. The existing `spreadsheet` submissionId dedup and
  the new `opencrvs` `${submissionId}:${index}` key are the working
  examples.
- **Builder is unblocked.** `builder/processors` can ship multi-instance
  UIs as soon as this lands on `dev`.
