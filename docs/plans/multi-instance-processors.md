# Multi-Instance Submission Processors

**Issues:** #94 (this work), #62 (parent design discussion), #95 (future per-instance dispatch)

## Goal

Allow forms to configure multiple processors of the same type (e.g. two email processors to different recipients) and have every entry actually run. Today every processor uses `.find()` to extract its config, so only the first entry of each type takes effect — and because the factory enqueues one SQS message per resolved handler, the first entry's work is actually duplicated while subsequent entries are silently dropped.

This unblocks `builder/processors`, which already allows authors to add multiple of the same type.

## Approach

**Internal iteration.** Each handler reads every matching entry from `payload.processors` and processes it. Dispatch stays one SQS message per processor *type*, so the message schema and consumer don't change.

Two layers need to change to make this work end-to-end:

1. **Dedup dispatch.** `ProcessorFactory.resolve()` currently returns one handler instance per matching config entry, which causes the listener to enqueue one SQS message per entry — all pointing at the same handler with the same payload. After this change, `resolve()` returns at most one handler per registered type that has at least one matching config. The listener enqueues once per type; internal iteration handles the rest.
2. **Iterate inside handlers.** Email, OpenCRVS, and Spreadsheet switch from `.find()` to `.filter()` and process every match. Payment keeps `.find()` semantics but logs a warning if multiple payment configs are present.

*Alternative considered — per-instance dispatch (Option B in #62):* one SQS message per config entry, with an index or `id` identifying which entry to act on. This gives independent retry and DLQ per entry, but requires changes to the message schema, listener, consumer, and handler signatures — and a decision between positional addressing and a schema change to add `id`. Deferred to #95 as a follow-up motivated by retry isolation rather than feature unblock.

*Alternative considered — leave dispatch alone, just `.filter()` in handlers:* rejected because the duplicate-enqueue bug is real and would cause emails (etc.) to be sent N² times for N same-type configs.

## Scope

- `ProcessorFactory.resolve()` deduplicates handlers by `type`. `resolveSplit()` inherits this via `resolve()`.
- `EmailProcessor.process()` iterates over all `email` entries; sends one email per entry. Per-entry warnings (missing recipient field, unresolved recipient) keep current behaviour — log and skip that entry, continue with the rest.
- `OpencrvsProcessor.process()` iterates over all `opencrvs` entries; POSTs once per entry. `X-Idempotency-Key` becomes `${submissionId}:${index}` (or similar) so retries of one entry don't collide with the others on the OpenCRVS side.
- `SpreadsheetProcessor.process()` iterates over all `spreadsheet` entries; each entry resolves its own filename and writes its own row. Existing column-1 submissionId dedup continues to protect against same-file retries.
- `PaymentProcessor.process()` keeps single-instance semantics. If `payload.processors.filter(p => p.type === "payment").length > 1`, log a warning identifying the form/submission and process only the first.
- Unit tests for each handler: add cases that exercise multiple same-type configs (including mixed success/skip paths for email).
- Unit test for `ProcessorFactory`: two same-type configs resolve to a single handler.
- Unit test for `PaymentProcessor`: warning is emitted when multiple payment configs are present.

## Files

- `apps/api/src/forms/submissions/processors/processor-factory.service.ts` — dedupe by type in `resolve()`.
- `apps/api/src/forms/submissions/processors/email.processor.ts` — `.find()` → `.filter()` + loop.
- `apps/api/src/forms/submissions/processors/opencrvs.processor.ts` — `.find()` → `.filter()` + loop, per-entry idempotency key.
- `apps/api/src/forms/submissions/processors/spreadsheet.processor.ts` — `.find()` → `.filter()` + loop.
- `apps/api/src/forms/submissions/processors/payment/payment.processor.ts` — warn on multiple payment configs; keep first-wins.
- `apps/api/src/forms/submissions/processors/processor-factory.service.spec.ts` — add dedup test.
- `apps/api/src/forms/submissions/processors/email.processor.spec.ts` — add multi-entry test.
- `apps/api/src/forms/submissions/processors/opencrvs.processor.spec.ts` — add multi-entry test.
- `apps/api/src/forms/submissions/processors/spreadsheet.processor.spec.ts` — add multi-entry test.
- `apps/api/src/forms/submissions/processors/payment/payment.processor.spec.ts` — add multi-payment-config warning test.

## Branch

`fix/multi-instance-processors` off `dev`.

## Verify

- `pnpm --filter api test` — all existing tests pass, new tests pass.
- `pnpm --filter api typecheck` — clean.
- Manual: configure a form with two `email` processors targeting different recipient fields. Submit once; confirm both emails arrive and the SQS log shows a single `email` message (not two).
- Manual: configure a form with two `payment` processors. Confirm a warning appears in the api logs identifying the submission, and that exactly one EzPay payment is initiated.
- Regression: a single-config form continues to enqueue exactly one SQS message per processor type.

## Sequencing with `builder/processors`

The builder branch will start producing multi-instance configs as soon as it ships. The order that avoids the footgun in #62:

1. Land this PR on `dev` first.
2. Then merge `builder/processors`.

If the builder branch needs to ship before this lands, gate its multi-instance UI behind a flag until this is in. Either order is fine; both shipping at the same time is the goal.

## Open questions

None — payment scope and dispatch model are settled per the discussion in #62 and the prompt that opened #94.
