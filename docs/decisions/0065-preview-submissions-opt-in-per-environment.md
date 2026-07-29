# 0065 — Feature-flagged forms are submittable per-environment via an opt-in flag

**Date:** 2026-07-28
**Status:** Accepted

## Context

ADR 0043 established that "preview is view-only; submissions require a published
version" and directed that any future "let operators test-submit a preview" be
handled by a dedicated test-submission harness, not by relaxing the submit path.
That record was written against **DB-only builder drafts** (a draft version that
exists only in `form_definitions`, never in the bundled files) — submitting one
would mint a real record off unpublished scratch, re-opening ADR 0007 / #145.

Since then two things changed the picture:

- **#1682** added `bypassVisibility`: a valid `X-Recipe-Preview` token lets a
  submission resolve the **published file recipe of a non-public form** and
  submit it normally. This is a different case from ADR 0043 — the recipe *is*
  committed to files, it is merely gated from the public by
  `meta.visibility` (`preview` / `draft` / `maintenance`).
- We now need to run a **feature-flagged form end-to-end** (submission +
  processors) in sandbox and staging before flipping its visibility to
  `public` — e.g. `apply-for-temporary-restaurant-licence`
  (`meta.visibility: "draft"`). Driving `X-Recipe-Preview` on every test
  submission is awkward, and the token also unlocks DB drafts, which we do not
  want here.

A submission with `bypassVisibility` false against a non-public form 404s on the
files path, then the draft-sourced guard re-finds it and throws the ADR 0043
400: *"This recipe is an unpublished preview and cannot be submitted."*

## Decision

**Introduce `ALLOW_PREVIEW_SUBMISSIONS` (env, default `false`). When `"true"`,
every submission defaults `bypassVisibility` to true**, so a non-public
**published file** recipe resolves and submits normally — no per-request token
required.

- The flag is read in `SubmissionsController.create` and OR-ed into the existing
  `bypassVisibility` signal, reusing the whole #1682 path unchanged.
- It only reaches **published file** recipes. `bypassVisibility` does not touch
  the recipe *source* (`source()` still forces `files` outside dev), so a
  DB-only builder draft still resolves to `null` → 404 → the ADR 0043 400.
  **ADR 0043 / #145 remain fully intact for DB drafts.**
- Default `false` keeps **production restricted**. The flag is set to `"true"`
  only in the sandbox and staging ECS task definitions (managed in AWS, not this
  repo). Re-restricting an environment later is a one-line env change.

## Consequences

- Sandbox/staging will create **real submission records, reference numbers, and
  notification emails** for feature-flagged forms. That is the point — it is how
  we exercise the full flow — but note SES defaults to the test inbox on those
  environments (`SES_DEFAULT_RECIPIENT`), so no real MDA is emailed.
- This does **not** supersede ADR 0043's rejection of a general "honour the
  preview token to submit DB drafts" — that remains out of scope. What changed
  is narrower: non-public *published* recipes (the #1682 case) are now
  submittable without a token on explicitly opted-in environments.
- The gate is environment config, not a per-request secret, so anyone who can
  reach a sandbox/staging API can submit its non-public forms. Acceptable for
  those environments; deliberately off in production.
