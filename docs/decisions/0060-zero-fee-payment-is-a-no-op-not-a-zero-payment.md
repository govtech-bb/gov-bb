# 0060 — A zero-fee payment is a no-op, not a zero-amount payment

## Context

A form's payment fee can be a dynamic expression (e.g. a fee-waiver branch), so
it may resolve to `0` for a given submission. The processor amount guard only
rejected **negative** amounts; `amount === 0` was treated as valid (schema is
`dynamic(z.number().nonnegative())`). A `0` fee therefore still gated the
pipeline, created a `Payment` row, called EzPay `createPayment`, and — after
#1445 — emitted `payment.required`, so the citizen received an
"Amount due: $0.00 — Pay now" email (#1449).

The issue asked us to decide whether `amount === 0` is a valid payment
configuration. Three options were on the table: treat zero as a no-op; allow
zero but suppress the email; or rely on EzPay rejecting a zero amount.

## Decision

A payment whose fee **resolves to `0` at submit time** means **no payment is
due**. The submission proceeds as a normal non-payment submission. The system
must not, for a resolved `0` amount:

- gate the pipeline (the submission is `SUBMITTED`, not `PENDING_PAYMENT`),
- create a `Payment` row,
- open a provider (EzPay) session, or
- emit `payment.required` (no "$0.00 — Pay now" email).

A `0` remains a **valid config value** — the schema stays `nonnegative`, and a
recipe may legitimately carry an expression that resolves to `0`. It is the
*resolved* `0` at submit time that is interpreted as "no payment", not a config
error.

The guard lives **upstream of the gating split** (`submissions.service`): the
payment amount is resolved before the submission entity is saved, and a
zero-amount payment is excluded from gating. This gets the submission status
right on first save, with no payment side-effects to unwind. (Alternative —
letting the processor no-op and then correcting an already-saved
`PENDING_PAYMENT` row — was rejected as more complex.)

## Consequences

- Future payment work must treat a resolved-`0` fee as "no payment", never as a
  degenerate `$0` transaction. Do not create `$0` provider sessions or `$0`
  payment notifications.
- Negative / non-numeric resolved amounts are **not** covered by this no-op
  path — they remain configuration errors and are rejected by the processor's
  existing post-resolution validation.
- The acceptance question "does EzPay accept or reject a `0` amount?" is moot
  under this decision: a `0` amount never reaches EzPay.
- This relies on payment being the only `gatesPipeline` processor. If another
  gating processor type is ever added, the zero-amount exclusion must filter the
  payment specifically rather than assume "no gating".
