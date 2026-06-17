# Emit `submission.created` after commit in the payment webhook (#299)

## Context

`PaymentWebhookService.fireDownstream` emitted `submission.created` **inside** the
`dataSource.transaction` block. `EventEmitter2.emit` is synchronous and the
`SubmissionProcessorListener` is `@OnEvent(..., { async: true })`, enqueuing to
SQS. On a multi-instance API, another process could dequeue and read the
submission row **before this transaction committed**, seeing `PENDING_PAYMENT`
instead of `SUBMITTED` — sending a confirmation email / forwarding to OpenCRVS /
auditing against a not-yet-committed state. Pre-existing on main; surfaced by a
May 2026 backend audit. Worked from `docs/plans/299-emit-after-commit.md`.

## What we did

- Refactored `fireDownstream` so the `dataSource.transaction` callback **returns**
  `SubmissionCreatedEvent | null`, and the `emit` happens **after**
  `await this.dataSource.transaction(...)` resolves (TypeORM resolves only after
  COMMIT). The two early-exits (submission not found; already transitioned) now
  `return null`, so they still emit nothing.
- No change to the status transition, the pessimistic lock, the contract fetch,
  or the event payload — only the emit's position moved.
- Added a `#299` spec case asserting the call order is `["tx-resolved", "emit"]`
  (the transaction mock records when it resolves; the emit mock records when it
  fires). The pre-fix code reverses that order, so the test is a real regression
  guard.

## Why we did it that way

- **Chose option (a) — emit after commit** over (b) `@OnEvent async` (doesn't
  change *when* emit is observed vs commit, so it doesn't fix the race) and (c) a
  full transactional outbox table + poller (much larger surface; only needed for
  guaranteed at-least-once delivery).
- **Mirrors the existing normal submission flow** (`submissions.service.ts`
  writes inside `submissionRepo.tx(...)` then emits after) — this brings the
  payment path to parity rather than inventing a new pattern.
- **Accepted residual:** a crash in the window *between* commit and emit loses
  that one event. This is the **same** behaviour the normal flow already has, so
  (a) keeps the two paths consistent; only the outbox (c) closes that gap, which
  is a separate follow-up if guaranteed delivery is ever required.
- **Testing reality:** the true multi-instance + SQS race can't be reproduced in
  a unit test (the spec mocks `dataSource.transaction` to run inline), so the
  proof is the structural move plus the order assertion and the unchanged
  no-emit-on-early-exit cases.

## Verification

- `payment-webhook.service.spec.ts`: 16 passed (15 existing + 1 new `#299`).
- `api:build` compiles clean.
