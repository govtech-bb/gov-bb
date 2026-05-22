# Multi-instance submission processors — Session Summary

**Date:** 2026-05-22
**Branch:** fix/multi-instance-processors → api/multi-processors
**Plan:** [docs/plans/multi-instance-processors.md](../plans/multi-instance-processors.md)
**ADR:** [docs/decisions/0006-submission-processors-iterate-internally.md](../decisions/0006-submission-processors-iterate-internally.md)
**Issues:** #94 (this work), #62 (design discussion), #95 (per-instance dispatch follow-up)

## What was built

Made forms with multiple processors of the same type (e.g. two `email`
processors to different recipients) actually run every entry instead of
duplicating the first and silently dropping the rest. Touched the
factory, four handlers, and their tests.

- `ProcessorFactory.resolve()` now dedupes by type — one handler per
  registered type that has ≥1 matching config, first-seen order. The
  listener consequently enqueues one SQS message per type, not per
  config entry.
- `EmailProcessor`, `OpencrvsProcessor`, `SpreadsheetProcessor` switched
  from `.find()` to `.filter()` + per-entry loop. Per-entry failures
  (missing required field, unresolved value, already-recorded
  submission) log a warning and skip *that entry*; the loop continues.
- `OpencrvsProcessor` builds `X-Idempotency-Key` as
  `${submissionId}:${index}` (position in `payload.processors`) so two
  entries' retries don't collide on the OpenCRVS side.
- `PaymentProcessor` kept first-wins semantics and added a warning when
  `>1` payment configs are present, identifying the submissionId and
  formId so operators can spot the misconfiguration.

## Why it looks the way it does

**Two layers had to change together.** Just changing handlers to
`.filter()` wasn't enough — the listener was already enqueuing N SQS
messages for N same-type configs (because `resolve()` returned the same
handler N times). Each consumer run would then iterate over all N
configs, so N entries would send N² emails. The factory dedup is the
load-bearing fix; the handler changes are what makes the second entry
*do* anything. Both shipped in one PR because either alone is wrong.

**`.filter()` order matches `payload.processors` order.** OpenCRVS uses
the position in the full `payload.processors` array as the idempotency
key index — not the position in the filtered list. The reason: an
operator reordering an unrelated processor (say, moving `email` before
`opencrvs`) should not shift the OpenCRVS idempotency keys and cause a
duplicate-submission storm on retry. Indexing against the unfiltered
array makes the key stable against same-type reordering relative to
other types. (Same-type reordering still shifts indices — that's
inherent to position-based addressing and is the trade-off we accepted
when not introducing per-entry `id`s. Per-instance dispatch in #95 would
fix this properly.)

**Payment is a deliberate exception to the iteration rule.** Payment
creates a Payment row, initiates an EzPay session, and gates the rest
of the pipeline. Running two payment configs would produce two Payment
rows for one submission and two EzPay redirect URLs — both pointing the
user somewhere, neither obviously the "right" one. First-wins-plus-warn
fails noisily to the operator (form is misconfigured) rather than
silently doing the wrong thing. ADR 0006 captures this as the general
rule for processors with uncoordinated side effects.

**Empty processors array short-circuits in SpreadsheetProcessor.** The
old code unconditionally `mkdirSync(exportDir, { recursive: true })`
before doing anything. With `.filter()` returning an empty list, we'd
still create the export dir for a form that has no spreadsheet
processors. Guarded with an early `if (entries.length === 0)` so an
empty list is a no-op.

**Updated one existing test that hardcoded the old idempotency key.**
`opencrvs.processor.spec.ts` expected `X-Idempotency-Key === "sub-002"`.
Plan explicitly calls out the format change; the test now asserts
`"sub-002:0"` and documents the format in a comment.

## Alternatives considered

- **Per-instance dispatch (Option B in #62):** one SQS message per
  config entry, with an index or `id` identifying which entry to act
  on. Gives independent retry and DLQ per entry, but requires changes
  to the message schema, listener, consumer, and handler signatures.
  Deferred to #95 — motivated by retry isolation rather than feature
  unblock.
- **Handler-only fix (leave dispatch alone, just `.filter()`):**
  rejected because the listener duplicate-enqueue is a real bug; N
  same-type configs would have produced N² emails.

## Verification

- `pnpm --filter api test` — 374 / 374 pass (43 suites, 31 new
  processor cases across factory, email, opencrvs, spreadsheet,
  payment).
- `npx nx build api` — clean typecheck through workspace deps.
- Lint on the touched files — clean. (Pre-existing lint errors live in
  unrelated modules: form-drafts, sqs producer/consumer specs,
  listener spec, registry, main.ts.)
- Manual smoke (configure two email processors, submit, observe SES
  + SQS) — deferred to post-merge per the plan; not feasible from CLI
  without a configured form and running stack.

## Sequencing

Plan called for this to land before `builder/processors`, which is
about to start producing multi-instance configs. The order from the
plan stands: this PR first; then builder ships and immediately benefits.
