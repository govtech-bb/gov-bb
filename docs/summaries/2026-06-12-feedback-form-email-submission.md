# Make the landing `/feedback` form actually send email

Issue: [#1298](https://github.com/govtech-bb/gov-bb/issues/1298)

## Context

The public feedback form at `landing…/feedback` reported success to the visitor
but delivered nothing. Its server function (`apps/landing/src/lib/send-feedback.ts`)
validated the input and then only `console.log`'d it — SES was a deliberate stub
("SES integration deferred"), not a regression. So all site feedback was silently
discarded with no error, no log alarm, no DLQ.

Not to be confused with [#1139](https://github.com/govtech-bb/gov-bb/issues/1139)
(separate, already closed): that was the *chat* assistant feedback, which *did*
go through the form-submission pipeline and misrouted to the test inbox because
its recipe's `config.feedback` recipient had no `form_config` row. The landing
form shares none of that machinery — it was simply never wired up. #1139 is the
cautionary precedent for the design choice below, not the cause of this bug.

## What we did

- **`apps/api` — new `src/feedback/` module.** `POST /feedback` controller
  (tight `@Throttle`, public/unauthenticated like other landing→API calls),
  `CreateFeedbackDto`, and a `FeedbackService` that builds a plaintext email and
  sends via its **own** `SESv2Client` + `SendEmailCommand` to `FEEDBACK_RECIPIENT`
  (default `feedback@govtech.bb`). Bounded retry (3 attempts, 200/500ms backoff);
  on final failure it logs a structured error, increments a new
  `feedback.email.failures` OTel counter (`MetricsService`), and throws → HTTP 500.
- **Config:** `feedbackRecipient` in `email.config.ts`, `FEEDBACK_RECIPIENT` in
  `env.validation.ts`, `FeedbackModule` registered in `app.module.ts`, both
  `.env.example` files documented.
- **`apps/landing`:** `send-feedback.ts` now POSTs to `${apiBase}/feedback` via
  an extracted, testable `postFeedback()`; the thin `createServerFn` handler
  supplies `apiBase` from `useRuntimeConfig().formsApiUrl`. `vite.config.ts`
  snapshots `VITE_FORMS_API_URL` into Nitro `runtimeConfig`. README/SPEC env
  tables updated.

## Why we did it that way

- **Direct SES, not the recipe/SQS/`form_config` pipeline.** Site feedback isn't
  a form submission, and the pipeline's recipient resolution carries the #1139
  trap (a missing `form_config` row silently falls back to a test inbox). Sending
  straight to SES with an **explicit env recipient** makes that misroute
  impossible. Per the user's call, the endpoint uses a *standalone* SES client
  rather than a shared refactor of `email.processor.ts` — accept a little wiring
  duplication, leave the working processor untouched.
- **Reused `VITE_FORMS_API_URL`, read via `runtimeConfig` — not a new var, not
  `process.env`.** The call is now server-side, and on Amplify the landing app is
  a Nitro SSR Lambda where Console env vars reach the **build container only,
  never the runtime** (the same constraint documented for `previewSecret`/
  `draftSecret` in `vite.config.ts`). A runtime `process.env.VITE_FORMS_API_URL`
  read would be `undefined` in prod. Snapshotting it into `runtimeConfig` is the
  app's existing answer; we reused the name to avoid a third alias for the same
  API. Trade-off: changing it needs a redeploy (fine — it's per-environment).
- **DTO carries the "at least one field" rule on an always-present sentinel
  (`present = true`).** `@IsOptional()` on the text fields short-circuits *all*
  validators on a field when it's absent — including a cross-field check attached
  to it — so an all-absent payload would slip through. The global `ValidationPipe`
  runs with `transform` off, so a `@Transform`-default can't be relied on either.
  A sentinel property the validator hangs off (and whose value it ignores)
  guarantees the rule always runs.
- **Reliability posture: visible failure, not durability.** Bounded retry + error
  log + failure metric + a real error state to the user (never false success).
  The durable-first option (persist feedback, email as best-effort) was scoped out
  as the upgrade path — proportionate for low-volume site feedback; the original
  sin was *silent* loss, which this removes.

## Open questions

None blocking. Out-of-band ops check: the `From` identity (`noreply@gov.bb`) and —
while SES is in sandbox — the `feedback@govtech.bb` recipient must be verified SES
identities, or sends fail. This is environment config, not code.

- A second notification-email case (transactional mail, etc.) would be the moment
  to record the "non-submission emails bypass the forms pipeline" boundary as an
  ADR; deferred for now (only one instance exists).
- The thin `sendFeedback` server-fn fallback chain (`runtimeConfig` → `process.env`
  → default) is the one untested line, by design — the testable logic lives in
  `postFeedback`.
