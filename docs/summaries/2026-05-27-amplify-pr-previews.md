# Amplify PR previews

## Context

The repo is public, and AWS Amplify's native PR-preview feature has a documented restriction: web previews can't be enabled for apps with backends in public repos, because a fork PR would otherwise execute under the Amplify Compute IAM role. Three of our four frontends (`landing`, `chat`, `form_builder`) are SSR (Amplify Compute output `.amplify-hosting`); only `forms` is static.

Goal of this session: per-PR preview URLs for all 4 frontends, posted as a sticky PR comment, deployed from the existing branch `feat/pr-previews` against `sandbox`. Plan: [`docs/plans/amplify-pr-previews.md`](../plans/amplify-pr-previews.md).

## What we did

- Added `.github/workflows/pr-preview.yml` (496 lines, 7 jobs): `setup` (nx-affected + amplify-config escape hatch), four per-app `preview-*` jobs (one each for forms / landing / chat / form-builder), a `comment` job (sticky table via `marocchino/sticky-pull-request-comment@v2`), and a `teardown` job that fires on PR close.
- Wired previews to the existing 4 sandbox Amplify apps (forms `d1j7z1k0h7u5nb`, landing `d3kbl8o0ovutw4`, chat `d3snq1f0c10466`, form-builder `d16oo4n0w76zwn`).
- Used existing `AWS_ROLE_ARN` (IAM already has `amplify:*` — no tofu changes needed).
- Concurrency: per-PR group, `cancel-in-progress: true` (Vercel-style; opposite of `deploy-sandbox.yml`'s `cancel-in-progress: false`, which is correct for real deploys).

## Why we did it that way

- **Custom workflow rather than Amplify's native PR previews.** The AWS restriction is on the *console toggle*, not the underlying branch API. A workflow that calls `aws amplify create-branch` + `start-job` works for static AND SSR apps in public repos. Internal-only PRs (no fork PRs) mean the security rationale behind the restriction doesn't apply to us in practice. Picking native for `forms` (static, allowed) and custom for the other three (SSR, blocked) would have meant inconsistent behaviour for no benefit.
- **Reused sandbox-branch patterns verbatim.** `deploy-sandbox.yml` already had nx-affected detection, the `amplify-config` escape hatch for workspace-root file changes, and the `start-job` + 30×30s polling loop. The new workflow copies that style line-for-line so maintenance is one mental model, not two. Difference: `--base=origin/${{ github.base_ref }}` for PR context instead of `nrwl/nx-set-shas` (which is for push events).
- **Branches on existing sandbox apps, not dedicated preview apps.** Considered (and rejected) provisioning 4 dedicated `*-preview` apps in tofu. The user pushed back — no functional benefit since preview builds *should* inherit sandbox env vars (previews against sandbox APIs is the realistic test). Saved 4 new tofu resources.
- **Sticky comment via `marocchino/sticky-pull-request-comment@v2`.** Mature, well-known. Less rope than rolling find-or-update with `gh api`.
- **Idempotent branch creation.** `get-branch` first, then `create-branch` only if missing. Avoids error-message matching against `BranchAlreadyExists`. Teardown does the same dance for cleanup so it tolerates apps where this PR never created a branch.

## What we almost got wrong

The plan was originally drafted against `dev`'s view of `deploy-sandbox.yml` — which referenced exactly one Amplify App ID (`d1yjf5g5ckxcxg`) and a single Amplify job. I'd carried that forward into the plan, baking in the wrong topology and a stale App ID. The user pushed back ("doesn't sound particularly correct, recheck — focus on sandbox or dev"), and re-fetching uncovered that `sandbox` is well ahead of `dev`: it has a per-app job structure with all 4 correct App IDs and a comment in the file itself flagging that `d1yjf5g5ckxcxg` is "the archived legacy monorepo app." Had we written the workflow against the dev-branch view, the forms preview would have deployed to a dead app.

**Invariant for future work on workflows in this repo:** when extending or copying CI/CD patterns, read from `sandbox` (the source of truth), not from whatever branch happens to be checked out locally. Branch staleness across active branches is a real risk here.

## Open questions

- **Live test pending.** Workflow only fires on `pull_request` events, so the test plan is the first real PR. Expect a shakedown round (IAM scope edges, branch-name corner cases, comment-action version drift).
- **Promotion to `dev`.** GHA reads workflow files from the PR's base branch. The workflow lives on `feat/pr-previews → sandbox` for now; for PRs targeting `dev` to get previews, it needs promoting via the team's normal `promote/dev-to-sandbox` flow (in reverse) or a separate PR to `dev`.
- **Branch name edge cases.** Pass `github.head_ref` verbatim. If Amplify rejects long or unusual names, fall back to `pr-<number>` — not done preemptively.
