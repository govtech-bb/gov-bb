# Per-instance SQS dispatch for submission processors

## Context

Issue [#95](https://github.com/govtech-bb/gov-bb/issues/95), a proactive
reliability follow-up to #94 / ADR 0006. After #94 each non-gating processor
*type* got one SQS message and the handler iterated all matching
`processors[]` entries internally. That traded away isolation: a failure on the
second email retried the whole `email` batch (re-sending the first), one slow
entry held its siblings under the same visibility timeout, and the DLQ recorded
the type, not the entry. Worked from `docs/plans/95-per-instance-sqs-dispatch.md`.

## What we did

- Each non-gating processor **entry** now gets its own SQS message, addressed by
  a positional `processorIndex` into the frozen `processors[]` snapshot.
- Carried `processorIndex` through the contract (`submissions.types.ts`,
  `submission-sqs-message.interface.ts`), the producer (body + `Number` message
  attribute), and the consumer (onto the reconstructed event + a delete-guard).
- Rewrote the listener: loop over `resolvedPayload.processors` by index,
  `resolveByType` per entry, skip unregistered (warn) + gating, dispatch the
  rest with their index.
- Narrowed all four non-gating processors to act on `processors[processorIndex]`
  only. Spreadsheet dedups on a composite `${submissionId}:${index}` token in a
  leading `submissionRef` column; webhook gained `X-Idempotency-Key:
  ${submissionId}:${index}`.
- Recorded the decision in ADR 0031; marked ADR 0006's dispatch decision
  superseded.

## Why we did it that way

- **Positional index over a persisted `id` on `Processor`.** The issue offered
  both. A message only ever addresses the snapshot it was enqueued with, and its
  whole retry→DLQ life happens against that frozen array — there's no
  cross-form-version identity need. So we extended the `${submissionId}:${index}`
  grain already used for idempotency keys (ADR 0006) and on-the-wire recipe
  identity (ADR 0009) rather than pay for a `form-types` schema change, builder
  id-minting, and back-compat for every existing form. Full reasoning in ADR 0031.

- **Index-only, no iterate-all fallback (user decision, deviates from the plan).**
  The plan defaulted to *keeping* the iterate-all branch for one release to
  absorb in-flight pre-deploy messages. The user chose to drain the queue at
  deploy and ship index-only instead — simpler handlers, at the cost that
  in-flight messages without an index are dropped (the consumer's guard deletes
  them). This flipped the back-compat spec: "legacy message without
  `processorIndex`" is now *rejected*, not *processed*.

- **Spreadsheet composite dedup is load-bearing, not belt-and-braces.** Under
  per-entry dispatch, two `spreadsheet` entries writing the same file would, with
  the old bare-`submissionId` dedup, make entry #2 see entry #1's row and wrongly
  skip. Keying dedup on `${submissionId}:${index}` is required for correctness,
  so we changed the column layout (leading `submissionRef` column) rather than
  treat it as optional hardening.

- **`?? 0` default in each processor.** Production always sets the index
  (listener + consumer), so `?? 0` exists only for direct/unit invocation —
  it selects the sole entry, and is not an iterate-all fallback.

- **Code-review fixes folded in before commit.** A review pass surfaced three
  issues we fixed: (1) the consumer's index guard read `payload.processors.length`
  before checking `processors` was an array, *outside* the execute try/catch — a
  corrupted body would have crash-looped the poller instead of being deleted;
  added an `!Array.isArray` short-circuit. (2) email/opencrvs threw on an empty
  `processors[]` while spreadsheet/webhook no-op'd — aligned all four to no-op.
  (3) tightened an overstated spreadsheet comment (see open questions).

## Open questions

- **Shared-file spreadsheet write race (deferred to a follow-up issue).** Two
  entries — or two submissions — appending to the same `.xlsx` race on
  read-modify-`writeFile` and can lose a row, because the consumer processes a
  received batch with `Promise.all` and there's no per-file lock. This pre-dates
  per-entry dispatch (cross-submission appends to a shared form file already
  raced); #95 only widens it to same-submission siblings. Out of scope here
  (the plan scoped spreadsheet to dedup correctness); filed as a follow-up.
- **Queue drain at deploy is now an operational prerequisite** — not enforced in
  code. If the queue isn't drained, pre-deploy in-flight messages are dropped.
