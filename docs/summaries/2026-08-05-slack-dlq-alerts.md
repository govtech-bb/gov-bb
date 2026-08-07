# Session summary — Slack alert on DLQ'd submission dispatch (#2168)

**Date:** 2026-08-05 · **Branch:** `feat/slack-dlq-alerts` (off `main`) ·
resolves #2168 · parent finding: case-management#85

## What shipped

When a submission dispatch permanently fails to reach its destination, the API
now posts a best-effort, non-PII Slack alert — the producer-side
"operator-visible signal" case-management#85 requires. Two terminal points in
`sqs-consumer.service.ts` fire it:
- a retryable failure on the **final allowed attempt** (`ApproximateReceiveCount
  >= SQS_MAX_RECEIVE_COUNT`) — the message is about to be dead-lettered;
- a **`NonRetryableError`** (e.g. `WebhookConfigError`) — dropped without retry.

Delivery is a small API-local `SlackNotifierService`
([apps/api/src/notifications/](apps/api/src/notifications/slack-notifier.service.ts)).

## Why it looks the way it does

- **The alert fires from the main consumer, not a DLQ consumer or infra alarm.**
  The DLQ is **AWS-native redrive** (`maxReceiveCount=3`); the app never observes
  the "landed in DLQ" event. Three options were weighed: (a) a separate DLQ
  poller — truest signal but a new long-running consumer + DLQ URL + IAM read +
  storm control; (b) a CloudWatch DLQ-depth alarm → SNS → Slack — pure infra,
  coalesced, but coarse (no per-message triage) and an ops hand-off, since this
  repo has **no IaC**; (c) the main consumer at the terminal attempt — it still
  holds the message payload, so full per-message triage context with no new
  infra. Chose (c). It requires mirroring the infra `maxReceiveCount` into
  `SQS_MAX_RECEIVE_COUNT` (documented, kept in sync).

- **Alert on `NonRetryableError` too, not just DLQ.** Those are deleted (not
  dead-lettered), but they're still a submission permanently failing to reach CM
  — the same operator signal, with distinct wording ("not retried" vs "routed to
  the DLQ").

- **Reuse the existing Slack pattern; API-local, not a shared package.**
  `SlackNotifierService` mirrors `apps/feature_flagging/app/server/slack-notif.ts`
  (webhook POST, 3s timeout, fail-soft swallow, `mrkdwnEscape`) as ~20 lines in
  `apps/api` rather than extracting a shared `@govtech-bb/slack` package (which
  would drag a cross-app refactor into this ticket). Extraction noted as a
  possible follow-up.

- **Fires once per failed submission, not per retry** — only on the terminal
  attempt — so a CM outage produces one alert per lost submission, not a storm.
  A CloudWatch DLQ-depth alarm remains a good complementary coarse signal.

- **Non-PII, and can't affect redrive.** The message carries only `formId`,
  reference, processor, error name, attempt — never the submission `values`
  (applicant name/email/phone), run through `sanitizeForLog` + `mrkdwnEscape`.
  The alert call is guarded so a misbehaving notifier can never surface into the
  catch block and change the delete-vs-leave decision (the notifier already
  swallows; the guard makes the guarantee independent of that contract).

- **Config.** `SLACK_ALERTS_WEBHOOK_URL` (env ← Secrets Manager at deploy);
  **unset ⇒ the notifier no-ops** (dev/sandbox). `SQS_MAX_RECEIVE_COUNT`
  defaults to 3.

## Out of scope
The retry/outbox/reconciliation mechanism and the DLQ itself (already in place /
tracked on #85); CM-side "never became a case" detection; the SES-event
consumer's DLQ; alert throttling beyond one-per-submission.

## Verification
`pnpm exec tsc -b` → 0 (caught + fixed a test-fixture type slip) ·
`nx run api:build` ✓ · `nx run api:test` — 1248 passed / 9 skipped, coverage gate
met ✓ · `nx run api:lint` ✓. New tests: the notifier (posts / no-op / never
throws / escapes) and the consumer (alerts on NonRetryable non-PII, alerts on
terminal attempt, not on a non-final attempt, still deletes if the notifier
throws).

## Runtime AC (sandbox-only)
Submitting a form whose dispatch fails should produce a Slack message and a
`notification_log`-visible failure — verifiable after deploy with the webhook
provisioned.
