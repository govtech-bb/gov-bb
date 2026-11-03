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

## Amendment — a smoke submission MAY webhook to a test programme (#3533)

E2E Journey 4 (#3011) must follow a real submission into case-management (CaMS)
and back. Under the decision above it cannot: a smoke submission fires no
webhook at all. This amends the rule with **one narrow, safe exception** — it
does not relax "zero real side-effects".

**Exception.** A smoke submission may dispatch a mapped (CaMS) webhook **if, and
only if, its recipe `mapping.programmeCode` is a reserved _test_ programme
code** — one prefixed `E2E_` (`TEST_PROGRAMME_CODE_PREFIX`, see
`isTestProgrammeCode` / `smokeAllowedProcessors` in `webhook-mapping.ts`). Every
other side-effect stays suppressed for a smoke submission: email, payment, and
**any webhook on a real programme code**.

**Invariant (unchanged in spirit): a smoke submission can never create a real
case, email a citizen, or open a payment.** It holds because:

- No real MDA programme code uses the `E2E_` prefix (the convention predates this
  — `E2E_PUBLISH_CHECK`), so the classifier cannot match a live programme.
- The exception keys on the **static recipe `mapping.programmeCode`**, never a
  catchment-resolved override — a catchment-routed (real health) form composes
  its per-polyclinic code from a real base code, so it never classifies as test.
- The gate is still the single `rawProcessors` choke point: for a smoke
  submission, `smokeAllowedProcessors` keeps only test-programme webhooks and
  drops everything else, so the `SubmissionProcessorListener` dispatch loop sees
  nothing else to run.

**Cross-repo dependency.** The safety of "test programme ⇒ no real case" is a
contract with CaMS: every `E2E_`-prefixed programme code MUST be registered on
the CaMS side as an `isTest` programme (removable via `removeTestCase`). If CaMS
treats an `E2E_` code as a real programme, this exception would create a real
case. Keep the two sides' definition of "test programme code" aligned.

**Still required of every consumer.** The original obligation stands: a
`submission.created` consumer that fires off `formId`/config rather than
`processors[]` is not covered by the choke point. Today the only side-effect
dispatcher is `SubmissionProcessorListener` (driven by `processors[]`), so the
`rawProcessors` filter is sufficient; the youth-opportunity listener named above
no longer exists. A future such consumer must honour both the smoke gate and
this test-programme exception.
