# Zero-amount payment is a no-op

**Issue:** [#1449](https://github.com/govtech-bb/gov-bb/issues/1449) — Decide
behaviour for payment processors with `amount === 0` (severity:minor, bug).

## What changed

A payment fee that resolves to `0` now means **no payment due**: the submission
proceeds as a normal `SUBMITTED` submission — no `Payment` row, no EzPay session,
no `payment.required` ("$0.00 — Pay now") email. Previously a `0` fee flowed
through the entire gating path because the guard only rejected negative amounts.
The behaviour decision is recorded in
[ADR 0060](../decisions/0060-zero-fee-payment-is-a-no-op-not-a-zero-payment.md).

## Why it looks the way it does

**Decision: option 1 of three.** The issue offered zero-as-no-op, zero-but-no-email,
or rely-on-EzPay-rejecting-zero. We chose the no-op: a `$0` fee (fee-waiver /
dynamic expression) is genuinely "nothing to pay", so creating a payment session
or emailing a `$0` demand is wrong in every case. The "no email" option only
hides the symptom (a `$0` EzPay session is still spun up), and the "rely on
EzPay" option can't be confirmed from our code — `ezpay.client` does no amount
validation, so a `0` amount's fate depends on EzPay's server. Under option 1
that question is moot: `0` never reaches EzPay.

**Guard placed upstream of the gating split.** The gating decision (`hasGating`)
drives the submission status (`PENDING_PAYMENT` vs `SUBMITTED`), the synchronous
gating branch, and whether `submission.created` is emitted — and it was being
made purely from processor *type*, before the dynamic amount was resolved. The
key enabling fact: `ResolutionContext.submission` is optional, so the amount can
be resolved from `{ values, meta }` **before** the entity is saved. So the guard
resolves the payment amount up front and, when it's `0`, excludes the payment
from gating — the submission then saves as `SUBMITTED` and emits
`submission.created` with no further changes.

**Rejected alternative (Shape B):** let `payment.processor` detect `0` and
return `completed`, then have the service flip the already-saved
`PENDING_PAYMENT` row to `SUBMITTED`. Rejected — it needs a post-save status
correction and a new "gating ran but produced nothing" code path; the upstream
guard gets the status right the first time. `payment.processor.ts` is therefore
unchanged.

**Only the exact `0` un-gates.** Negative / non-numeric resolved amounts stay on
the gating path and hit the processor's existing post-resolution validation —
they are config errors, not no-ops.

## Tests

The existing payment-gating tests mock `resolveSplit` but leave
`contract.processors` empty, so they were unaffected (no payment config found →
still gated). `makeMocks` gained an optional `processors` field so a test can
feed a payment config; two cases added — `amount 0` ⇒ `SUBMITTED` /
`submission.created` / gate never fires / no deferred, and `amount > 0` ⇒ still
`PENDING_PAYMENT` and gates. Service spec 27/27; full `api:test` 922 passed (only
the pre-existing no-Postgres DB-migration smoke tests fail); `api:build` clean.
