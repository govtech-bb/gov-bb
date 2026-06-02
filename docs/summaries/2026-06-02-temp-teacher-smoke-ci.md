# Run the temp-teacher live smoke test in CI after sandbox deploy (#585)

## Context

The request came in as "add e2e tests for the `temp-teacher-application-barbados`
form, run locally and on each PR." Orienting on the code reframed the task
substantially. Plan: `docs/plans/temp-teacher-smoke-ci.md`.

## What we did

- Added a `smoke-test-forms` job to `.github/workflows/deploy-sandbox.yml`
  (`needs: amplify-forms`) that runs the **existing**
  `e2e/smoke/temp-teacher-application.smoke.spec.ts` against the deployed
  sandbox, with `--retries=2` and a trace artifact on failure.
- Added a `smoke` target to `apps/forms/project.json` and documented the
  unit / mocked-e2e / live-smoke split in `apps/forms/README.md`.
- Recorded the governing principle in
  [ADR 0027](../decisions/0027-live-smoke-tests-run-post-deploy-not-per-pr.md).
- No test code was written — the spec and `playwright.smoke.config.ts` already
  existed.

## Why we did it that way

- **The task was CI wiring, not test authoring.** A comprehensive live smoke for
  this form already existed (built alongside the vendor-registration smoke). The
  only gap was that nothing ran it automatically — CI ran *zero* Playwright.

- **"On each PR" is impossible for a live test, so we changed the trigger — see
  ADR 0027.** temp-teacher is a real DB-backed form fetched from the API; the
  mocked `test:e2e` suite only knows the synthetic `master` fixture. A PR can't
  serve the real form, and real submits per PR file real applications + emails.
  We surfaced this contradiction explicitly (the user had picked both "verify the
  live form" *and* "on each PR") and reconciled to **post-deploy**: a job gated
  behind the forms Amplify deploy. The fully-mocked per-PR alternative was named
  and rejected — it can't catch backend/submission regressions, which is the
  point of a live smoke.

- **`needs: amplify-forms`, not a `workflow_run` workflow.** The dependent-job
  approach only runs when forms actually deployed (a skipped/failed dependency
  skips it) and reuses the deploy workflow's context. A separate `workflow_run`
  workflow would fire on API-only deploys too and buys nothing here; noted as the
  fallback if we later want the smoke decoupled from the deploy workflow.

- **No AWS creds in the smoke job.** This was the key simplification over the
  initial assumption (the planning UI had floated "AWS via OIDC"). The job drives
  a browser against the public URL; uploads use server-issued presigned URLs. So
  unlike every other job in `deploy-sandbox.yml`, it skips
  `configure-aws-credentials`.

- **Retries on the CLI, not the config.** `playwright.smoke.config.ts` stays
  `retries: 0` so on-demand local runs fail fast and honestly; CI overrides with
  `--retries=2` to absorb post-deploy CloudFront/edge flakiness.

- **Scoped to just the temp-teacher spec.** `test:smoke` runs the whole
  `e2e/smoke/` dir (also the vendor spec); per the user's choice the CI job passes
  the spec path so only temp-teacher runs. Verified with `playwright test --list`
  (1 test) rather than executing it — a real run submits to sandbox.

## Open questions

- **Blocking on flaky live failures.** Chosen blocking-with-retries. If the
  deployed form/network proves flaky in practice, revisit (report-only, or wider
  retry/backoff).
- **Prod smoke.** Out of scope; would mirror this against the prod deploy.
- **First real proof is post-merge.** The smoke was validated statically + via
  `--list`; it has never actually run, because a real run files a sandbox
  submission. The next sandbox forms deploy is the first live exercise.
