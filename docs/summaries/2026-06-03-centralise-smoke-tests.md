# Centralise live smoke tests into a reusable workflow + shared helpers (#638)

## Context

Two earlier pieces of work ([#585](https://github.com/govtech-bb/gov-bb/issues/585),
[#610](https://github.com/govtech-bb/gov-bb/issues/610)) wired live smoke tests
into CI: temp-teacher post-deploy in `deploy-sandbox.yml`, term-leave per-PR in
`pr-preview.yml`. Each job carried the same checkout → pnpm → Playwright-install
→ run-spec → upload-trace boilerplate, and the three smoke specs
(temp-teacher, term-leave, vendor-registration) each re-declared ~80% of the
same Playwright helpers (`primaryButton`, `expectStep`, `advance`, `fillField`,
`selectRadio`, `uploadOne`, the submit + confirmation block). Plan:
`docs/plans/centralise-smoke-tests.md`.

## What we did

- Added a reusable workflow `.github/workflows/forms-smoke.yml`
  (`on: workflow_call`, inputs `base_url` / `spec` / `artifact_name`) holding the
  smoke job steps once.
- `deploy-sandbox.yml`: replaced the single `smoke-test-forms` job with two thin
  `uses:` caller jobs — `smoke-test-temp-teacher` and
  `smoke-test-vendor-registration`, both `needs: amplify-forms`.
- `pr-preview.yml`: `smoke-test-forms-preview` kept its job id (so the PR check
  name is preserved) but became a `uses:` caller, same `needs: preview-forms`
  and `SUCCEED` guard, passing the preview URL as `base_url`.
- Extracted the shared helpers into `apps/forms/e2e/helpers/smoke.ts` and
  refactored all three specs onto it (~449 deletions for ~187 insertions net).
- Amended [ADR 0027](../decisions/0027-live-smoke-tests-run-post-deploy-not-per-pr.md)
  and updated `apps/forms/README.md`.

## Why we did it that way

- **Reusable workflow, not a standalone smoke workflow or `workflow_run`.**
  Job-level `needs:` only resolves within one workflow file, so the smoke jobs
  could not simply move out and keep their `needs: amplify-forms` /
  `needs: preview-forms` edges. A `workflow_call` reusable workflow defines the
  steps once while each caller keeps its dependency edge and (for the preview)
  its output plumbing. `workflow_run` was rejected for the same reasons ADR 0027
  rejected it originally — it loses the preview URL and the direct edge.

- **Shared helpers + thin per-form specs, NOT a recipe-driven generic driver.**
  A single spec that reads the live contract and auto-fills every form was
  considered and rejected: the in-repo recipes show documented drift from the
  deployed forms (term-leave `comments` required live but optional in the
  recipe; vendor step IDs numbered on deploy but bare in the recipe), and a
  generic driver would still have to encode conditionals, repeatable steps,
  masked fields, and the presign→S3 upload flow. The shared-helper extraction
  captures the real duplication without taking on that fragility.

- **`expectStep` carries an `exact` flag** because the specs genuinely differ:
  temp-teacher matches step IDs exactly (the deployed form keeps the recipe's
  bare IDs), while term-leave and vendor match by substring (robust to a
  deployment renumbering its data steps). The shared helper defaults to
  substring and temp-teacher opts into `{ exact: true }`.

- **`submitAndConfirm` leaves the `POST /submissions` wait on the global test
  timeout, uncapped.** A code review caught that folding vendor's submit block
  into the shared helper would have newly capped its submission wait at 15s
  (vendor's original was uncapped). Rather than preserve a per-spec quirk, we
  made the submission wait uncapped for all three: the submission is the one
  step with a real side effect and can be slow against a cold deployed backend,
  so a tight cap there only invites flakiness. The confirmation-navigation wait
  keeps `STEP_TIMEOUT`.

- **vendor-registration joined the post-deploy smoke.** It already had a
  comprehensive on-demand spec but ran in no CI job. Wiring it post-deploy means
  a forms deploy now files **two** real submissions (temp-teacher + vendor,
  recipient `testing@govtech.bb`) — an accepted extension of the cadence cost
  ADR 0027 already documented. Confirmed published on the sandbox API before
  wiring.

## Notes / follow-ups

- The post-deploy check name changed (`smoke-test-forms` → two jobs, and `uses:`
  jobs render as `<caller-job> / smoke`). It fires on push to `sandbox`, not as
  a PR gate, so it is unlikely a required check — but any branch-protection rule
  referencing the old name needs updating. The PR-gate `smoke-test-forms-preview`
  kept its job id.
- The `e2e/` directory sits outside the forms eslint tsconfig project, so all
  e2e files (including the new `smoke.ts`) report a pre-existing "TSConfig does
  not include this file" parsing error under `nx lint`. Not introduced here and
  not a CI gate (CI runs `build` + `test`); worth fixing separately.
