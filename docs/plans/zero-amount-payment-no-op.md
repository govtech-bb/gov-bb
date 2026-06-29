# Plan: amount === 0 payment is a no-op (submission proceeds normally)

Issue: [#1449](https://github.com/govtech-bb/gov-bb/issues/1449) — Decide
behaviour for payment processors with `amount === 0` (severity:minor, bug).

## Decision (option 1)

A payment fee that resolves to `0` (e.g. a fee-waiver branch / dynamic
expression) means **no payment is due**. The submission must proceed as a normal
non-payment submission: no payment gate, no `Payment` row, no EzPay
`createPayment` call, and no `payment.required` ("Amount due: $0.00 — Pay now")
email.

Today the guard at
[payment.processor.ts:52-60](apps/api/src/forms/submissions/processors/payment/payment.processor.ts)
only rejects `amount < 0`; `amount === 0` flows through the whole gating path.
The schema is `dynamic(z.number().nonnegative())`
([processor.type.ts:34](packages/form-types/src/processor.type.ts)), so `0`
validates.

## Approach

Guard **upstream of the gating split**, in `submissions.service`, so the zero
case never enters the payment flow at all.

Why this works cleanly: the gating decision (`hasGating`,
[submissions.service.ts:67-68](apps/api/src/forms/submissions/submissions.service.ts))
drives the submission status (`PENDING_PAYMENT` vs `SUBMITTED`), the synchronous
gating branch, and whether `submission.created` is emitted. `ResolutionContext.submission`
is optional ([types.ts:1-4](packages/expressions/src/types.ts)), so the payment
`amount` can be resolved from `{ values, meta }` **before** the entity is saved —
early enough to inform the gating decision.

Steps:
1. After `resolveSplit(rawProcessors)`, if `split.gating` contains the payment
   processor, resolve that processor's config against `{ values, meta }` and read
   `amount`.
2. If the resolved `amount === 0`, drop the payment processor from
   `split.gating` (so `hasGating` becomes false when it was the only gating
   processor).
3. Downstream logic is unchanged: the submission saves as `SUBMITTED`
   (+`submittedAt`), takes the non-gating branch, and emits `submission.created`
   — the normal async processors run, and the listener already skips gating
   processors so the (now non-gating) payment entry is ignored.

`payment.processor.ts` needs no change — with the upstream guard it is never
invoked for a zero amount.

### Alternative considered (rejected)

Let `payment.processor` detect `amount === 0` and return `completed`, then have
the service flip the already-saved `PENDING_PAYMENT` row to `SUBMITTED` and emit
`submission.created`. Rejected: it requires a post-save status correction and a
new "gating ran but produced nothing" code path; the upstream guard gets the
status right the first time.

## Scope

- Resolve the payment amount before the gating decision and exclude a
  zero-amount payment processor from gating.
- Tests for the new behaviour; keep existing positive-amount gating tests green.
- No change to the EzPay client or the `nonnegative` schema (0 stays a valid
  *config* value; it is simply treated as "no payment" at submit time).

## Files

- **Modify** `apps/api/src/forms/submissions/submissions.service.ts` — resolve
  payment amount up front; drop zero-amount payment from `split.gating`.
- **Modify** `apps/api/src/forms/submissions/submissions.service.spec.ts` (or the
  relevant existing service spec) — add the `amount === 0` cases.
- Possibly **Read/confirm** `processor-factory.service.ts` (`resolveSplit`) to
  pick the cleanest way to exclude one processor from the gating set.

## Verify

- New unit tests, with the payment dependencies mocked:
  - `amount === 0` ⇒ submission status `SUBMITTED` (+`submittedAt`),
    `submission.created` emitted, **no** `deferred` in the result, EzPay
    `createPayment` **not** called, `payment.required` **not** emitted.
  - `amount > 0` ⇒ unchanged: `PENDING_PAYMENT`, gating branch, `deferred`
    paymentUrl returned, EzPay called, `payment.required` emitted.
  - `amount < 0` / non-numeric ⇒ still rejected (existing processor guard).
- `pnpm exec nx run api:test` green; `pnpm exec nx run api:build` clean.

## Open questions / notes

- EzPay's own handling of a `0` amount remains unconfirmed (our client does no
  amount validation — [ezpay.client.ts](apps/api/src/forms/submissions/processors/payment/ezpay/ezpay.client.ts)).
  Under option 1 this is now moot: a `0` amount never reaches EzPay. Acceptance
  item "confirm EzPay accepts/rejects 0" is resolved by removing the call, not by
  testing EzPay.
- Multiple gating processors: payment is currently the only `gatesPipeline`
  type, so dropping a zero-amount payment empties `split.gating`. The guard will
  filter just that processor, not assume it is the only one.
