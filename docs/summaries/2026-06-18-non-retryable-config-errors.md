# Non-retryable config errors for the email processor (#518 + #621)

## Context

The email processor already threw on an unresolvable recipient (so it failed
visibly — #518, via #509). But the SQS consumer retried **every** thrown error
the same way: leave the message, let SQS retry to the max, then route to the
DLQ. So a permanent **config** error (a misconfigured recipient that will never
resolve) was retried pointlessly into the DLQ — the #621 concern. Worked from
`docs/plans/518-621-non-retryable-config-errors.md`. Approved with Shannon: throw
so it stays visible, but mark config errors non-retryable.

## What we did

- Added `NonRetryableError` (a small `Error` subclass) — the type itself signals
  "permanent; don't retry."
- Email processor: missing `recipientField` and unresolved recipient now throw
  `NonRetryableError`. The outer `catch` was wrapping **every** failure into one
  generic error; it now rethrows a `NonRetryableError` untouched and only wraps
  the rest — so an SES delivery failure or a resolver/DB exception stays a normal
  (retryable) error.
- SQS consumer: on `NonRetryableError`, log at error level and **delete** the
  message (no retry). All other errors keep the existing leave-for-retry → DLQ
  behaviour.
- Tests on both files (see below).

## Why we did it that way

- **The type is the signal.** A plain `Error` gives the consumer nothing to
  branch on — permanent and transient failures look identical, so it had to
  retry everything. A distinct class lets the consumer split them with
  `instanceof`, without fragile message-string matching.
- **Preserve the type in the email `catch`.** The single most important line is
  `if (err instanceof NonRetryableError) throw err;` — without it, the existing
  wrap-everything `catch` would re-wrap the config error as a plain (retryable)
  error and defeat the change.
- **Correctness line — only resolved-to-nothing is non-retryable.** A resolver
  that *throws* (DB/infra down) is transient and must stay retryable; it
  propagates to the `catch`, is wrapped, and retries. Locked with a test so a DB
  outage can never be misclassified as permanent (which would silently lose the
  email with no DLQ record).
- **Scope held to email + consumer.** Webhook is owned by a separate change;
  opencrvs/payment/spreadsheet untouched. No dedicated metric/alert — the error
  log is the surfaced signal (a metric is a possible follow-up).

## Verification

- `email.processor.spec.ts` + `sqs-consumer.service.spec.ts`: 75 passed,
  including config → `NonRetryableError`, SES failure → retryable, resolver
  exception → retryable, and consumer delete-on-non-retryable vs leave-on-normal.
- `api:build` compiles clean.

## Trade-off / follow-up

- A non-retryable failure is deleted, so there is no DLQ trail — visibility rests
  on the error log. A dedicated metric/alert on `NonRetryableError` is a possible
  follow-up if log-watching isn't enough.
