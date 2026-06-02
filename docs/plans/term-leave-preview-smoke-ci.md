# Plan: term-leave smoke test gated on the per-PR forms preview

**Issue:** [#610](https://github.com/govtech-bb/gov-bb/issues/610) ·
**PR:** new PR off current `sandbox` (see status note) ·
**Base branch:** `sandbox`

> **Status (re-checked after pulling sandbox, 27 commits):** PR #591 was
> **closed/abandoned** — its temp-teacher work merged instead via **PR #614**.
> So the foundation this plan builds on is **already on sandbox**:
> `temp-teacher-application.smoke.spec.ts` (v1.2.0 field IDs),
> `playwright.smoke.config.ts`, the `smoke` nx target, the `smoke-test-forms`
> post-deploy job in `deploy-sandbox.yml`, ADR 0027, and `preview-forms`'
> `outputs.url` / `outputs.status` in `pr-preview.yml`. The term-leave spec,
> the per-PR-preview job, and the ADR amendment are **still undone** — this plan
> remains necessary. Changes vs. the original draft: open a **new PR off
> sandbox** (not "un-draft #591"), and the new ADR is **0029** (0028 is taken).

## Goal

Give the `term-leave-application` form a live, end-to-end smoke test, and run it
in CI **against the branch's own deployed forms preview** so a frontend
regression is caught on the PR — not only after a sandbox deploy. Validate the
spec locally against sandbox first.

## Approach

`pr-preview.yml` already builds a per-PR Amplify forms deployment for every
**non-draft** PR and exposes it as `preview-forms` job outputs (`url`,
`status`). We add a downstream job that `needs: preview-forms`, waits for it to
succeed, and runs the term-leave smoke spec with `SMOKE_BASE_URL` set to that
preview URL. The spec itself mirrors the existing
`temp-teacher-application.smoke.spec.ts` and runs via the existing
`playwright.smoke.config.ts` (kept out of the mocked `test:e2e` suite).

**Why per-PR-preview rather than post-deploy (the temp-teacher model):**
ADR 0027 ruled live smoke tests must run post-deploy because, at the time, a PR
could not serve a real DB-backed form. Per-PR previews removed that constraint —
the branch's frontend is genuinely deployed and talks to the sandbox API (which
already serves `term-leave-application` v1.2.0). So we can gate the PR on a real
run. This plan amends ADR 0027 to record that.

**Alternatives considered & rejected:**
- *Local build served inside the CI runner* — wouldn't exercise the deployed
  frontend + real backend path the preview gives us.
- *Run against the live sandbox URL (temp-teacher's model)* — tests sandbox, not
  the branch's un-merged code; doesn't satisfy "test against the branch".
- *Drive the form but stop before the real submit* — loses backend/submission
  coverage, the whole point of a live smoke test. We accept a real submit, using
  `testing@govtech.bb` so no real person is emailed.

## Scope

- [ ] Write `apps/forms/e2e/smoke/term-leave-application.smoke.spec.ts`.
- [ ] Run it locally against sandbox; resolve the auto-injected
      `check-your-answers` / `declaration` step details against the live
      renderer; confirm it reaches the confirmation screen.
- [ ] Add a `smoke-test-forms-preview` job to `.github/workflows/pr-preview.yml`.
- [ ] Add ADR **0029** amending/superseding ADR 0027 for the per-PR-preview
      case.
- [ ] Branch off current `sandbox` (DNS-safe branch name — avoid `+`/`/` quirks
      in the Amplify preview subdomain) and open a **new** non-draft PR against
      `sandbox`; un-drafting/opening triggers the preview build the new job
      runs against.
- [ ] Reference + close #610 when merged (`Closes #610` in the PR body).

## The form (term-leave-application v1.2.0)

Far simpler than temp-teacher — **no file uploads, no S3/AWS creds, no repeatable
steps, no 3-part date widgets** (dates are plain text). Steps and required
fields (rendered field id = `${stepId}_${fieldId}`):

| step | required fields |
|------|-----------------|
| `applicant-info` | `school`, `firstName`, `lastName`, `contactNo`, `email`, `post`, `idNumber` |
| `leave-details` | `leaveStartDate`, `leaveEndDate`, `previousLeaveGranted` (radio → answer **no** to skip the `previousLeaveDetails` show-hide); `comments` optional |
| `applicant-signature` | `applicantSignature`, `signatureDate` |
| `official-use` | `recommendation` (radio: `recommend`/`notRecommend`), `principalSignature`, `dateSigned`; `officialComments` optional |
| `declaration` | renderer-auto (confirm checkbox + applicant/date) — **confirm shape when running locally** |
| `submission-confirmation` | terminal assertion |

Set `email` to `testing@govtech.bb` (the form has an email processor on
`applicant-info.email`).

## Files

| file | change |
|------|--------|
| `apps/forms/e2e/smoke/term-leave-application.smoke.spec.ts` | **add** — the spec |
| `.github/workflows/pr-preview.yml` | **modify** — add `smoke-test-forms-preview` job (`needs: preview-forms`, `if: needs.preview-forms.outputs.status == 'SUCCEED'`, `SMOKE_BASE_URL=${{ needs.preview-forms.outputs.url }}`, trace artifact on failure) |
| `docs/decisions/0029-*.md` | **add** — ADR amending 0027 for per-PR-preview real-submit smoke gating (0028 is already taken) |
| `docs/decisions/0027-*.md` | **modify** — add a "Superseded/amended by 0029" note |
| `apps/forms/README.md` | **modify** (optional) — note the term-leave preview smoke alongside temp-teacher |

No changes to `playwright.smoke.config.ts` (already `SMOKE_BASE_URL`-driven) or
to `apps/forms/project.json` (the `smoke` target from PR 591 is reused).

## Verify

- **Local:** `SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter
  @govtech-bb/forms exec playwright test --config playwright.smoke.config.ts
  term-leave-application.smoke.spec.ts` passes (real submit, 2xx, confirmation
  screen). Confirm a test application + email actually land.
- **Build/test gates (per CLAUDE.md):** `pnpm exec nx run-many -t build
  --exclude=landing` and `pnpm exec nx run-many -t test` green.
- **CI:** `playwright test --list --config playwright.smoke.config.ts
  term-leave-application.smoke.spec.ts` resolves to exactly the one spec.
- **End-to-end:** after un-drafting PR 591, the `Preview (forms)` job builds and
  `smoke-test-forms-preview` runs green against the preview URL.

## Open questions / risks

1. **Branch name → subdomain.** The preview subdomain is `${BRANCH//\//-}`, so a
   `+` or other non-DNS char in the branch name yields an unreachable URL. Since
   this is a fresh branch, just pick a DNS-safe name (e.g.
   `feat/610-term-leave-preview-smoke`, which sanitises cleanly to
   `feat-610-term-leave-preview-smoke`).
2. **Auto-injected `declaration` / `check-your-answers` steps.** term-leave's
   `declaration` step has no declared elements and there is no
   `check-your-answers` step in the recipe. The renderer likely injects both
   (temp-teacher's were auto-injected). Resolve the exact selectors when running
   locally.
3. **Does the preview frontend hit the sandbox API that serves term-leave?**
   Assumed yes (preview rebuilds only the Amplify frontend; form definitions
   come from the deployed API). The local sandbox run validates the form is
   published; confirm the preview points at the same API.
4. **Preview timing.** `preview-forms` waits up to 15 min for Amplify; the smoke
   job starts only after `SUCCEED`. Ensure total non-draft-PR wall-clock is
   acceptable.
