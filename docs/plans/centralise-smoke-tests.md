# Plan: Centralise live smoke tests into a reusable workflow + shared helpers

> Tracking issue: [#638](https://github.com/govtech-bb/gov-bb/issues/638)
> Status: planned (not yet implemented).
> Related: ADR [0027](../decisions/0027-live-smoke-tests-run-post-deploy-not-per-pr.md),
> ADR [0029](../decisions/0029-per-pr-preview-smoke-tests-gate-the-frontend.md).

## Goal

Make the live smoke suite maintainable and cheap to extend. Today the smoke
jobs are embedded as bespoke jobs in two deploy workflows, and the three smoke
specs duplicate ~80% of their Playwright helper code. Centralise both — a
reusable CI workflow and a shared helper module — so adding a form's smoke
coverage is a thin spec + a thin caller job, not a copy-paste of boilerplate.

This is a **refactor of existing wiring**, not a behaviour change: same
triggers, same `needs:` edges, same `--retries=2` CI override, no AWS creds.
ADR 0027 (post-deploy smoke) and ADR 0029 (per-PR preview smoke) stay in force.

## Why

- **CI boilerplate is duplicated.** `smoke-test-forms` in `deploy-sandbox.yml`
  and `smoke-test-forms-preview` in `pr-preview.yml` repeat the same
  checkout → `pnpm/action-setup` → `setup-node` → `pnpm install` →
  `playwright install --with-deps chromium` → run spec → upload-trace steps,
  differing only in base URL, spec name, and artifact name.
- **Helper code is duplicated.** `temp-teacher-application`,
  `term-leave-application`, and `vendor-registration` each re-declare
  `primaryButton`, `currentStep`, `expectStep`, `advance`, `fillField` /
  `fill`, `selectRadio`, (`uploadOne` for temp-teacher), and the
  submit + confirmation-screen assertion block.

## Approach

### Chosen: shared helpers + thin per-form specs, behind a reusable workflow

- **CI**: one reusable workflow (`on: workflow_call`) holds the smoke job
  steps once. Job-level `needs:` only resolves within a single workflow file,
  so the smoke jobs cannot simply move to a standalone workflow and keep their
  `needs: amplify-forms` / `needs: preview-forms` edges. A reusable workflow
  called via `uses:` keeps the edge in the caller while defining the steps once.
- **Test code**: extract the common helpers into one module; each spec keeps
  its hand-written, form-specific body (field IDs, step order, special cases)
  but imports the shared helpers.

### Alternatives considered

- **Fully recipe/contract-driven generic driver — rejected.** One spec that
  fetches the live contract and auto-fills every field by type. Rejected as
  fragile: the in-repo recipes (`apps/api/.../recipes/`) show documented drift
  from the deployed forms — term-leave's `comments` is required on the live
  form but optional in the recipe; vendor's deployed step IDs are numbered
  (`step-1-basic-info`) while the recipe uses bare IDs (`basic-info`). A
  generic driver would also have to encode conditionals, repeatable steps,
  masked fields (NRN needs `pressSequentially`), and the presign→S3→confirm
  upload flow. High complexity for coverage the thin specs already give.
- **Data-driven hybrid (generic runner + per-form answers descriptor) —
  deferred.** Reasonable future step once the shared helpers exist, but more
  upfront design than this change needs.
- **`workflow_run` separate workflow — rejected.** ADR 0027 already chose a
  dependent job over a `workflow_run` workflow; it also loses the per-PR
  preview URL needed by the pr-preview smoke. The reusable workflow keeps the
  direct dependency edge and the output plumbing.

## Scope

1. **Reusable workflow** `.github/workflows/forms-smoke.yml`
   - `on: workflow_call` with inputs:
     - `base_url` (required) — `SMOKE_BASE_URL` for the run.
     - `spec` (required) — the `*.smoke.spec.ts` filename to run.
     - `artifact_name` (required) — name for the failure trace artifact.
   - Steps: checkout → `pnpm/action-setup` → `setup-node` (pnpm cache) →
     `pnpm install --frozen-lockfile` →
     `pnpm --filter @govtech-bb/forms exec playwright install --with-deps chromium` →
     run `playwright test --config playwright.smoke.config.ts <spec> --retries=2`
     with `SMOKE_BASE_URL: ${{ inputs.base_url }}` →
     upload `apps/forms/test-results/` as `${{ inputs.artifact_name }}` on failure.

2. **`deploy-sandbox.yml`** — replace the inline `smoke-test-forms` job with two
   thin caller jobs, both `needs: amplify-forms`:
   - temp-teacher: `spec: temp-teacher-application.smoke.spec.ts`,
     `base_url: https://forms.sandbox.alpha.gov.bb`,
     `artifact_name: temp-teacher-smoke-trace`.
   - vendor-registration: `spec: vendor-registration.smoke.spec.ts`,
     same `base_url`, `artifact_name: vendor-registration-smoke-trace`.
   - Both use `uses: ./.github/workflows/forms-smoke.yml` and inherit
     `secrets`/permissions as needed (no AWS creds required).
   - Update the `summary` job is **not** required (smoke jobs aren't in its
     table today); leave it unchanged.

3. **`pr-preview.yml`** — replace the inline `smoke-test-forms-preview` job with
   one thin caller job:
   - `needs: preview-forms`,
     `if: needs.preview-forms.result == 'success' && needs.preview-forms.outputs.status == 'SUCCEED'`,
     `base_url: ${{ needs.preview-forms.outputs.url }}`,
     `spec: term-leave-application.smoke.spec.ts`,
     `artifact_name: term-leave-preview-smoke-trace`.

4. **Shared helpers** `apps/forms/e2e/helpers/smoke.ts`
   - Export the common helpers, parameterised where the three specs differ:
     - `primaryButton(page)`
     - `currentStep(page)`
     - `expectStep(page, stepIdOrSubstring, { exact?: boolean })` — temp-teacher
       matches step IDs exactly; term-leave and vendor match by substring.
     - `advance(page, fromStep)`
     - `fillField(page, stepId, suffix, value)`
     - `selectRadio(page, stepId, suffix, optionValue)`
     - `uploadOne(page, stepId, fieldId, file)` (waits on the `Remove {name}`
       confirmed-upload button)
     - `submitAndConfirm(...)` — the submit + `POST /submissions` 2xx assertion
       + `submission-confirmation` step + confirmation-screen text. Parameterise
       the confirmation heading (`Submission Confirmation` vs `Application
       Submitted`) and whether a reference number is asserted.
   - Refactor all three specs onto it, deleting their local copies. Keep each
     spec's form-specific body (field IDs, ordering, masks, repeatables,
     conditionals) inline — those are the parts that legitimately differ.

5. **Docs / close-out**
   - Short ADR amendment note (or a line in the existing 0027/0029) recording
     that the smoke jobs are now defined in a reusable workflow and that
     vendor-registration joined the post-deploy smoke.
   - Comment on and close #638 with the PR link.

## Files

- **Add**: `.github/workflows/forms-smoke.yml`
- **Add**: `apps/forms/e2e/helpers/smoke.ts`
- **Modify**: `.github/workflows/deploy-sandbox.yml` (replace one job with two
  caller jobs)
- **Modify**: `.github/workflows/pr-preview.yml` (replace one job with a caller
  job)
- **Modify**: `apps/forms/e2e/smoke/temp-teacher-application.smoke.spec.ts`
- **Modify**: `apps/forms/e2e/smoke/term-leave-application.smoke.spec.ts`
- **Modify**: `apps/forms/e2e/smoke/vendor-registration.smoke.spec.ts`
- **Maybe modify**: a docs/decisions/ ADR note

## Verify

- **Pre-flight**: confirm `smart-stream-vendor-registration` is published on the
  sandbox API (`curl https://forms.api.sandbox.alpha.gov.bb/form-definitions/smart-stream-vendor-registration`)
  so its post-deploy job can submit. If not yet published, hold the vendor
  caller job until it is.
- `pnpm exec nx run-many -t build --exclude=landing` compiles; `-t test` passes.
- Each refactored spec still passes on-demand against sandbox:
  `SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms exec playwright test --config playwright.smoke.config.ts <spec>`.
- Reusable workflow validates (e.g. `actionlint` if available) and both callers
  reference it correctly; a sandbox deploy fires both post-deploy smoke jobs and
  a non-draft PR fires the preview smoke job, each against the right base URL.

## Consequences / notes

- **Two real submissions per forms deploy.** Adding vendor-registration
  post-deploy means each forms deploy now files two real applications
  (temp-teacher + vendor, recipient `testing@govtech.bb`), extending the cadence
  ADR 0027 accepted. Downstream processors/inboxes must tolerate it.
- **No behaviour change otherwise.** Triggers, dependency edges, retries, and
  the no-AWS-creds property are all preserved.

## Open questions

- Confirm vendor-registration is sandbox-published (verify step above). If it
  isn't, ship the refactor without the vendor caller job and add it once
  published.
- ADR: amend 0027/0029 in place, or add a brief new record for the reusable
  wiring? (Lean: a short amendment note on 0027, since the decision is
  unchanged — only the implementation shape is.)
