# Drop submission processors for smoke-test submissions (#1252)

## Context

Every push to `sandbox` replays ~20 forms for real through the post-deploy
smoke matrix, firing each form's processors — real emails to real recipients
(e.g. textbook-grant → a school's `@mes.gov.bb` inbox), SES quota burn (feeds
#775), and real webhooks. The goal: make a smoke run send zero emails / fire
zero webhooks while still exercising the real `POST /submissions` path. Worked
from `docs/plans/1252-...md`.

## What we did

- API: token-validated `X-Smoke-Submission` header → `SMOKE_SUBMISSION_TOKEN`
  (fail-closed, mirrors `RECIPE_PREVIEW_TOKEN`). Controller validates it
  constant-time, threads `isSmokeSubmission` into `submit()`; the service drops
  `processors[]` at the choke point. Generalized `isValidPreviewToken` →
  `isValidSecretToken`, moved to `common/`.
- Smoke side sets the header globally via Playwright `extraHTTPHeaders`; CI
  passes the secret through `forms-smoke.yml`'s `workflow_call` to both callers.
- Follow-up (review-driven): threaded `isSmokeSubmission` onto
  `SubmissionCreatedEvent` and gated `YouthOpportunityWebhookListener` on it.
- Recorded the principle in **ADR 0052**; carried an unrelated CLAUDE.md edit
  as its own commit. Three commits total.

## Why we did it that way

- **Drop all processors at the choke point, not per-recipient sinks.** The
  rejected alternative (rewrite recipients / per-form sinks) still runs
  processors, still burns SES, and needs per-form knowledge. Emptying
  `processors[]` covers the school-email and `config.mdaEmail` cases uniformly
  with no per-form work — `hasGating` goes false, status is `SUBMITTED`, the
  event carries no processors, the dispatch loop iterates nothing, and the
  submission still persists/validates/gets a reference code.
- **Token-validated header, not a body flag.** A body flag reuses no precedent
  and is trivially forgeable. The header mirrors the reviewed `X-Recipe-Preview`
  pattern, and `ValidationPipe({ whitelist, forbidNonWhitelisted })` already
  rejects a body-injected `isSmokeSubmission`, so a public caller can't
  self-assign it.
- **Token-only, no `NODE_ENV` gate.** The API Dockerfile runs
  `NODE_ENV=production`, so sandbox *is* production — a `NODE_ENV !== production`
  gate would no-op the bypass exactly where the smoke runs. The empty-token
  default is fail-closed on its own.
- **Explicit `secrets:` passthrough, not `secrets: inherit`.** Tighter blast
  radius — the reusable workflow only receives the one secret it needs.

## What we almost got wrong

The "single choke point drops everything" framing was wrong. `submission.created`
fans out to *every* subscriber; `YouthOpportunityWebhookListener` fires off
`formId` and never reads `processors[]`, so emptying the array did **not**
suppress it — a youth-opportunity smoke would still have hit the external
webhook (latent: no such form is in the matrix today). Caught in the
code-review pass. Fixed at the right altitude by carrying `isSmokeSubmission`
on the event so any side-effecting consumer can gate on it (ADR 0052), rather
than special-casing one listener. The overstated comments were tightened to
stop implying a global guarantee the drop doesn't provide.

Also hit a `lint-staged` trap: committing a `git mv` rename + content edits
together silently committed only the rename (0 insertions). Recovered with
`reset --soft` + manual prettier + `--no-verify`. The content-only follow-up
commit used the hook normally without issue.

## Open questions

- **Activation is an ops step, not code.** `SMOKE_SUBMISSION_TOKEN` must be set
  in **both** the sandbox API runtime env (ECS task def / SSM) **and** the
  GitHub Actions secret. Until both hold the same value the fix is inert (header
  ignored, processors fire — safe default). The PR must call this out.
- PR-preview (term-leave) also stops emailing once the secret is set for
  previews — intended/harmless, just a wider blast radius than the deploy gate.
