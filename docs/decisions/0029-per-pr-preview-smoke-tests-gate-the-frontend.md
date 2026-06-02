# 0029 — Live smoke tests may gate a PR via its Amplify preview (amends 0027)

**Date:** 2026-06-02
**Status:** Accepted — amends [0027](0027-live-smoke-tests-run-post-deploy-not-per-pr.md)
**Related:** [#610](https://github.com/govtech-bb/gov-bb/issues/610).

## Context

[ADR 0027](0027-live-smoke-tests-run-post-deploy-not-per-pr.md) ruled that live,
real-submitting smoke tests run **post-deploy, never as a per-PR CI gate**. Its
first reason was load-bearing:

> **The PR's form isn't deployed.** A real form is rendered from a contract the
> API serves out of a deployed environment's database. At PR time the branch
> serves nothing, so "test the real form" can only mean "test some deployed
> environment" — which is not the PR's diff.

That premise no longer holds for the **frontend**. `.github/workflows/pr-preview.yml`
now builds a per-PR Amplify deployment for each frontend app on every **non-draft**
PR, exposing the forms preview as the `preview-forms` job's `url` / `status`
outputs. The branch's forms frontend *is* deployed and reachable, so a live smoke
test can drive the PR's actual frontend code.

One thing the preview does **not** change: it rebuilds only the Amplify
**frontend**. That frontend talks to the **sandbox API**, and form contracts are
served from there. So a preview smoke exercises *the branch's frontend against
the sandbox backend and sandbox-published contracts* — not any branch-side
backend or contract change, and only for forms already published on sandbox.

0027's second reason — real submits per PR create real records and emails — is
unchanged and still applies.

## Decision

A live smoke test **may** run as a per-PR gate **against the PR's own Amplify
preview**, in addition to (not instead of) the post-deploy smoke, when:

1. it `needs: preview-forms` and runs only on its `SUCCEED` status (so it never
   runs against a missing/failed preview, and is skipped on draft PRs, which
   build no preview); and
2. the form under test is already **published on the API the preview frontend
   talks to** (sandbox today).

Concretely: a `smoke-test-forms-preview` job in `pr-preview.yml` runs the
`term-leave-application` smoke spec with
`SMOKE_BASE_URL=${{ needs.preview-forms.outputs.url }}`. Like the post-deploy
job it needs no AWS credentials (headless browser against the public preview URL)
and overrides the config's `retries: 0` with `--retries=2` on the CI invocation.
`term-leave-application` was chosen as the first preview smoke because it has **no
file uploads**, so it needs no presign/S3 flow and is the simplest real-submit
path.

Smoke specs still live under `e2e/smoke/`, run only via
`playwright.smoke.config.ts`, and stay **out of** the mocked `test:e2e` / `nx
test` suite — that separation from 0027 is unchanged.

## Consequences

- **The two smokes are complementary, by scope.** The preview smoke catches
  **frontend** regressions on the PR (the branch's rendered form against the
  sandbox backend). The post-deploy smoke (`smoke-test-forms`, temp-teacher in
  `deploy-sandbox.yml`) remains the gate that exercises the **deployed
  frontend + backend together** after a real sandbox release. Neither replaces
  the other.
- **Real submissions per preview build are accepted.** Each non-draft-PR push
  that rebuilds the forms preview fires a real submission (recipient
  `testing@govtech.bb`). This is the same cadence cost 0027 accepted for the
  post-deploy smoke, now also incurred per qualifying PR. Downstream
  processors/inboxes must tolerate it.
- **Only sandbox-published forms can be preview-smoked.** A form not yet live on
  the sandbox API cannot be gated this way — its contract isn't served to the
  preview frontend. New forms get a preview smoke once published.
- **Gating vs. merge-blocking is a branch-protection setting.** The job surfaces
  as its own PR check; whether a red result blocks merge is configured in repo
  branch protection, separate from this workflow wiring.
- **Per-PR mocked frontend tests remain the other option.** As 0027 noted, a
  fully-mocked per-PR test against the `master` fixture is still the way to gate
  frontend-only behaviour without a deployed preview or a real submission.
