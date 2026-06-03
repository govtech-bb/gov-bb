# 0027 — Live smoke tests run post-deploy, not per-PR

**Date:** 2026-06-02
**Status:** Accepted — amended by [0029](0029-per-pr-preview-smoke-tests-gate-the-frontend.md)
**Related:** [#585](https://github.com/govtech-bb/gov-bb/issues/585). Builds on the on-demand live-smoke pattern established by the Smart Stream Vendor Registration smoke test (`docs/plans/vendor-registration-smoke-test.md`).

> **Amended by [ADR 0029](0029-per-pr-preview-smoke-tests-gate-the-frontend.md):**
> once per-PR Amplify previews existed, the "the PR's form isn't deployed"
> premise below no longer held for the *frontend*. A live smoke **may** now gate
> a PR against its own preview (frontend-only scope; real submissions still
> apply). The post-deploy smoke this ADR describes remains in force.

## Context

The forms app has two distinct kinds of end-to-end test:

- **The mocked `test:e2e` suite** (`apps/forms/playwright.config.ts`, `e2e/*.spec.ts`)
  boots a local Vite dev server and exercises the synthetic `master` form — a
  bundled JSON fixture (`contracts/master-contract.json`) — with **mocked**
  submissions. It needs no backend and is safe to run anywhere.
- **Live smoke tests** (`playwright.smoke.config.ts`, `e2e/smoke/*.smoke.spec.ts`)
  drive a **real, DB-backed** form (e.g. `temp-teacher-application-barbados`),
  upload files through the real presign → S3 → confirm flow, and **submit for
  real**, asserting the confirmation screen.

A recurring request is "run the e2e test for form X on each PR." For a *live*
smoke test this is not achievable, and wiring it that way would be actively
harmful:

1. **The PR's form isn't deployed.** A real form is rendered from a contract the
   API serves out of a deployed environment's database. At PR time the branch
   serves nothing, so "test the real form" can only mean "test some deployed
   environment" — which is not the PR's diff.
2. **Real submits per PR create real records and emails.** Every run files a real
   application and fires recipient emails, and needs backend reachability.

The mocked alternative (commit the contract as a fixture + intercept the
contract fetch + mock uploads/submission) *can* run per-PR, but was explicitly
rejected for form X smoke coverage: the fixture drifts from the published form
and it cannot catch backend/submission regressions — which is the whole point of
a live smoke test.

## Decision

Live, real-submitting smoke tests run against **deployed environments on a
post-deploy trigger** — never as a per-PR CI gate — and stay **out of** the
mocked `test:e2e` / `nx test` suite.

Concretely, for the sandbox environment: the live smoke runs as a
`smoke-test-forms` job in `.github/workflows/deploy-sandbox.yml` that
`needs: amplify-forms` (the job that builds and releases the forms app via
Amplify). Because a skipped or failed dependency skips the dependent job, the
smoke runs **only when forms actually deployed** and **only after** that deploy
succeeds.

The two suites stay separated by config and directory:
`playwright.config.ts` sets `testIgnore: "**/smoke/**"`, and live smoke specs
live under `e2e/smoke/` and run solely via `playwright.smoke.config.ts`.

## Consequences

- **New form smoke tests follow the same wiring.** A live smoke for another form
  belongs under `e2e/smoke/`, runs via `playwright.smoke.config.ts`, and is
  triggered post-deploy — not added to `test:e2e` and not made a PR check. If a
  *per-PR* signal is wanted, that is a separate, fully-mocked test against the
  `master` fixture, understood to verify the frontend only.
- **The post-deploy smoke needs no AWS credentials.** It drives a headless
  browser against the public deployed URL; file uploads use presigned URLs the
  deployed API issues server-side. The CI job needs only network access +
  Playwright — no OIDC role. (Contrast the deploy jobs themselves, which assume
  an AWS role to talk to ECR/ECS/Amplify.)
- **Each deploy produces a real submission.** A green smoke means a real
  application was filed in the target environment (recipient `testing@govtech.bb`)
  on every forms deploy. That cadence is accepted as the cost of a true
  end-to-end signal; downstream processors/inboxes must tolerate it.
- **Retries belong on the CI invocation, not the config.** `playwright.smoke.config.ts`
  keeps `retries: 0` so an on-demand local run surfaces a genuine failure
  immediately; the CI job overrides with `--retries=2` to absorb post-deploy edge
  cache / network flakiness without masking a real regression.
- **Prod is out of scope here.** This record covers the sandbox post-deploy
  smoke. A prod post-deploy smoke, if wanted later, would follow the same shape
  against the prod deploy workflow.

## Amendment (2026-06-03) — smoke jobs centralised in a reusable workflow ([#638](https://github.com/govtech-bb/gov-bb/issues/638))

The trigger, scope, and separation decisions above are unchanged; only the
wiring shape is. The per-job step boilerplate (checkout → pnpm → Playwright →
run spec → upload trace) now lives once in a reusable workflow,
`.github/workflows/forms-smoke.yml` (`on: workflow_call`, inputs `base_url` /
`spec` / `artifact_name`), called via `uses:` from both the post-deploy and the
[0029](0029-per-pr-preview-smoke-tests-gate-the-frontend.md) per-PR-preview
workflows. Job-level `needs:` only resolves within one workflow file, so each
caller keeps its dependency edge while sharing the steps.

The single `smoke-test-forms` post-deploy job is now two caller jobs in
`deploy-sandbox.yml` — `smoke-test-temp-teacher` and
`smoke-test-vendor-registration`, both `needs: amplify-forms`. So a forms deploy
now files **two** real submissions (temp-teacher + vendor-registration), not
one; the cadence cost noted above applies per smoked form. The shared Playwright
step/field helpers the three specs duplicated now live in
`apps/forms/e2e/helpers/smoke.ts`.
