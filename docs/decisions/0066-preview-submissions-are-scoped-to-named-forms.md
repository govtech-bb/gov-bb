# 0066 — Preview submissions are scoped to named forms, not the whole environment

**Date:** 2026-08-07
**Status:** Accepted — supersedes ADR 0065

## Context

ADR 0065 introduced `ALLOW_PREVIEW_SUBMISSIONS`, an environment-wide boolean.
When `"true"`, `SubmissionsController.create` set `bypassVisibility` on **every**
submission, so **every** non-public published-file recipe on that environment
became submittable without an `X-Recipe-Preview` token.

That is broader than the need it was introduced for. ADR 0065 was written to
exercise one feature-flagged form — `apply-for-temporary-restaurant-licence`
(`meta.visibility: "draft"`) — end to end on sandbox and staging before flipping
it public. The flag instead unlocked the submit path for every form gated by
`meta.visibility` or by a `service_status` row (ADR 0063), including forms
hidden for reasons unrelated to testing: a service pulled for maintenance, a
half-migrated recipe, a form withdrawn after a content problem.

ADR 0065 recorded the residual risk plainly — "anyone who can reach a
sandbox/staging API can submit its non-public forms" — and accepted it as the
price of the capability. It is not: the capability is per-form by nature, so the
gate can be per-form too.

## Decision

**Replace `ALLOW_PREVIEW_SUBMISSIONS` with `PREVIEW_SUBMISSION_FORM_IDS`, a
comma-separated allowlist of form IDs.** A submission bypasses the visibility
gate when its `formId` appears in that list, or when it carries a valid
`X-Recipe-Preview` token. Empty (the default) means no environment-level bypass
at all.

- Read in `SubmissionsController.create` and OR-ed into the existing
  `bypassVisibility` signal, reusing the whole #1682 path unchanged. Nothing
  downstream of the controller changes.
- **No wildcard and no `"true"` alias.** Re-admitting "all forms" would
  re-admit the problem this record exists to fix. Blanket access is now
  expressible only by listing every form by hand, which is the point.
- Still reaches **published file** recipes only. `bypassVisibility` does not
  touch the recipe *source* (`source()` still forces `files` outside dev), so a
  DB-only builder draft resolves to `null` → 404 → the ADR 0043 400.
  **ADR 0043 / #145 remain fully intact for DB drafts.**
- An unrecognised ID in the list is inert — it matches no submission. The env
  schema deliberately does not validate membership: recipes resolve from files
  at runtime, so the set of valid IDs is not known at boot, and ADR 0061 warns
  that a hard boot-time env gate crash-loops ECS.

`ALLOW_PREVIEW_SUBMISSIONS` is removed from the schema rather than deprecated.
The schema is `.passthrough()`, so a value still present in a deployed task
definition is accepted and ignored; the controller logs a warning at boot when
it sees one, so the behaviour change surfaces in CloudWatch instead of being
rediscovered during a failed test run.

## Consequences

- The sandbox and staging ECS task definitions (managed in AWS, not this repo)
  must set `PREVIEW_SUBMISSION_FORM_IDS=apply-for-temporary-restaurant-licence`
  and drop `ALLOW_PREVIEW_SUBMISSIONS`. Until they do, preview submissions are
  off on those environments: the submit path 404s on files, the draft-sourced
  guard re-finds the recipe, and the caller gets the ADR 0043 400. It fails
  closed, and the boot warning names the cause.
- Adding a second form to the test set is now a task-definition edit rather than
  a code change — the same operational cost as before, with the blast radius
  named explicitly instead of implied.
- The gate is still environment configuration, not a per-request secret: anyone
  who can reach a sandbox/staging API can submit the **listed** forms. That
  residual risk is unchanged in kind but bounded to forms someone deliberately
  named, which is what makes it acceptable.
- ADR 0065's core judgement stands and is not reversed — non-public *published*
  recipes are legitimately submittable on opted-in environments, unlike DB
  drafts. Only the granularity of the opt-in changes.
