# 0052 — A smoke submission produces zero side-effects; every `submission.created` consumer gates on it

## Context

The post-deploy and per-PR live smoke matrices (`deploy-sandbox.yml` /
`pr-preview.yml` → `forms-smoke.yml`) submit real forms against
`forms.sandbox.alpha.gov.bb` on every push. We needed those runs to send zero
real emails and fire zero real webhooks while still exercising the full
`POST /submissions` path (persist, validate, reference code, confirmation).

The fix (#1252) marks a request as a smoke submission via a token-validated
`X-Smoke-Submission` header, threads `isSmokeSubmission` into
`SubmissionsService.submit`, and drops the processor array at the submit choke
point: `rawProcessors = dto.isSmokeSubmission ? [] : (contract.processors ?? [])`.

It is tempting to treat that one line as *the* choke point — "the submission
pipeline keys everything off `processors[]`, so emptying it drops every
side-effect." That is **false**. `submission.created` is an event the
event-emitter fans out to *every* subscriber. `SubmissionProcessorListener`
dispatches the `processors[]` entries (so emptying the array silences it), but
`YouthOpportunityWebhookListener` is a separate subscriber that decides to call
the external case-management webhook purely from `event.formId` and never reads
`processors`. An empty `processors[]` did not suppress it — a youth-opportunity
smoke submission would still have hit the real external webhook. No
youth-opportunity form is in the smoke matrix today, so it was latent, but the
"single choke point" framing would have let it leak silently the moment one was
added.

## Decision

A smoke submission must produce **zero** real side-effects. Dropping
`processors[]` is necessary but **not sufficient**.

Every consumer of `submission.created` that triggers a real side-effect (email,
webhook, external dispatch, payment) must independently short-circuit on
`event.isSmokeSubmission`. The flag is carried on `SubmissionCreatedEvent` for
exactly this purpose. A consumer that fires off `formId`, recipient config, or
anything other than `processors[]` is **not** covered by the choke-point drop
and must gate itself.

Any newly added `submission.created` consumer inherits this obligation: if it
can produce an outward-facing effect, gate it on `isSmokeSubmission` and add a
test proving a smoke event is suppressed.

## Consequences

- `SubmissionCreatedEvent` carries `isSmokeSubmission?: boolean`;
  `SubmissionsService` sets it on the emitted event from
  `dto.isSmokeSubmission`.
- `YouthOpportunityWebhookListener.handleSubmissionCreated` returns early when
  `event.isSmokeSubmission` is set, with a test asserting a mapped
  youth-opportunity smoke event does not dispatch.
- The processor-drop comment in `submissions.service.ts` no longer claims a
  global "nothing fires" guarantee — it documents that it covers only
  `processors[]`-driven side-effects and that formId-driven consumers gate
  separately.
- Reviewers of any future `submission.created` subscriber should ask "does this
  produce a real side-effect, and does it honour `isSmokeSubmission`?" before
  approving. The processor array is the dispatch mechanism, not the trust
  boundary for "is this real."
- Independent of all this, the bypass is inert until `SMOKE_SUBMISSION_TOKEN` is
  set on **both** the API runtime env and the GitHub Actions secret; when unset
  the header is ignored (fail-closed) and processors fire as normal.
