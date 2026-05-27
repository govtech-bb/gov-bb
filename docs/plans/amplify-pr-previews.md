# Amplify PR previews

## Goal

Auto-deploy per-PR preview URLs for the 4 frontend apps (`forms`,
`landing`, `chat`, `form_builder`), one URL per app, posted as a sticky
PR comment. A reviewer opens any PR (non-draft), waits a few minutes,
clicks the URL, and sees the change running.

This is a Vercel-style "every PR has a URL" workflow on top of AWS
Amplify Hosting.

## Constraint context

AWS Amplify's **native** PR preview feature has a documented restriction:
[web previews can't be enabled for apps with backends in public
repos](https://docs.aws.amazon.com/amplify/latest/userguide/pr-previews.html).
The reason is fork-PR safety — a stranger's PR would otherwise execute
in your AWS account using your Amplify Compute IAM role.

Three of our four apps (`landing`, `chat`, `form_builder`) emit
`.amplify-hosting` (Amplify Compute / SSR), so the native feature is
blocked for them. `forms` emits a static `dist/` and could use the
native feature, but using it for one app and a custom workflow for the
other three would be inconsistent for no benefit.

The restriction applies to the **auto-preview feature in the Amplify
console**, not to the underlying Amplify branch API. A GHA workflow
that calls `aws amplify create-branch` + `start-job` for a PR branch
works regardless of public/private or static/SSR. Internal-only PRs
(no external contributors) mean the security rationale doesn't apply
to us in practice.

## Approach

One GHA workflow, triggered on PR `opened`, `synchronize`,
`reopened`, `ready_for_review`, and `closed`. On a fire:

1. **Setup job** — mirror the `setup` job in
   `.github/workflows/deploy-sandbox.yml`: checkout with
   `fetch-depth: 0`, install pnpm/node, run
   `pnpm exec nx show projects --affected --base=origin/${{ github.base_ref }} --head=HEAD --type app --json`,
   then emit per-app booleans (`forms`, `landing`, `chat`, `fb-app`).
   Also emit `amplify-config=true` when `amplify.yml` or this
   workflow file itself changes in the diff — same escape hatch the
   sandbox deploy uses to force all 4 to rebuild.
2. **Per-app preview jobs** (4 of them, `preview-forms`,
   `preview-landing`, `preview-chat`, `preview-form-builder`), each
   gated on its respective affected output OR `amplify-config`. Each
   job: configure AWS creds via OIDC, call
   `aws amplify create-branch` (ignore `BranchAlreadyExists`), then
   `aws amplify start-job --job-type RELEASE` against the PR's source
   branch, then poll `aws amplify get-job` until terminal — copy the
   exact polling loop already in `amplify-forms`/`amplify-landing`/
   `amplify-chat`/`amplify-form-builder` in `deploy-sandbox.yml`.
3. **Comment job** — `needs` all 4 preview jobs with
   `if: always()`. Post or edit a sticky PR comment (marker like
   `<!-- amplify-pr-preview -->`) listing one line per affected app
   with status emoji + URL
   (`https://<sanitised-branch>.<app-id>.amplifyapp.com`).
4. **Teardown job** — separate job, runs only on PR `closed`. Loops
   the 4 app IDs and calls `aws amplify delete-branch`, swallowing
   "not found" errors (the branch only exists on apps that were
   actually affected at some point).

Draft PRs are skipped via `if: github.event.pull_request.draft == false`.
A draft → ready-for-review transition fires the `ready_for_review`
event and triggers the preview.

**Concurrency:** `group: pr-preview-${{ github.event.pull_request.number }}`,
`cancel-in-progress: true` — a new push cancels the in-flight preview
run. Mirror of Vercel behaviour. (Contrast with `deploy-sandbox.yml`,
which explicitly does NOT cancel mid-flight; that's correct for prod
deploys but wrong for ephemeral previews.)

**Where previews live:** the existing 4 sandbox Amplify apps
(`d1j7z1k0h7u5nb`, `d3kbl8o0ovutw4`, `d3snq1f0c10466`,
`d16oo4n0w76zwn`). No new infrastructure. Preview builds inherit
sandbox env vars, which is what we want — previews should hit sandbox
APIs.

**Branch lifecycle in IaC:** the 4 Amplify apps themselves stay in
OpenTofu (already there). Per-PR branches do **not** go in tofu —
they're ephemeral, born and die with the PR, managed entirely by the
workflow. Tofu and the workflow would fight over ownership otherwise.

### Nx project name reminder

Folder name ≠ nx project name. The mapping:

| Folder              | Nx project       | Amplify app ID (sandbox) |
|---------------------|------------------|--------------------------|
| `apps/forms`        | `forms`          | `d1j7z1k0h7u5nb`         |
| `apps/landing`      | `landing`        | `d3kbl8o0ovutw4`         |
| `apps/chat`         | `chat`           | `d3snq1f0c10466`         |
| `apps/form_builder` | `form-builder-app` | `d16oo4n0w76zwn`       |

### Alternatives considered

- **AWS Amplify native PR previews.** Blocked by the public-repo +
  backend restriction for 3 of 4 apps. Rejected — inconsistent.
- **Dedicated `*-preview` Amplify apps** (4 new apps). Cleaner
  isolation, but no functional benefit — sandbox env vars are what we
  want previews to use, and ephemeral branches on existing apps are
  trivial to clean up. Rejected as over-engineered.
- **[`yinlinchen/amplify-preview-actions`](https://github.com/yinlinchen/amplify-preview-actions)
  off-the-shelf action.** Mature pattern for this exact problem. We're
  rolling our own instead because we need monorepo-aware behaviour
  (affected-only across 4 apps with 4 different Amplify app IDs), and
  the existing `deploy-sandbox.yml` already has the OIDC + polling
  patterns to copy. We can revisit if this turns out to be more code
  than expected.
- **Build-and-upload (`aws amplify start-deployment` with a ZIP).**
  Would let us build once in GHA and push artifacts directly, skipping
  Amplify's GitHub pull. More work, no benefit since Amplify's pull
  works fine for internal branches.

## Scope

- New file: `.github/workflows/pr-preview.yml`.
- App IDs go in the workflow `env:` (not secret — IAM role is the
  gate, matching the existing `deploy-sandbox.yml` convention).
- Reuse: existing `AWS_ROLE_ARN` secret + OIDC config from
  `deploy-sandbox.yml`. IAM role has `amplify:*` so no tofu changes
  needed.
- Update CI workflow trigger? No — keep `ci.yml` as-is. Preview is a
  separate workflow that runs in parallel with the existing checks.

## Files

- `.github/workflows/pr-preview.yml` — new. Develop on the `sandbox`
  branch (most current; ahead of `dev`). PRs target both `dev` and
  `sandbox` per `ci.yml`, so the workflow needs to land on both
  branches via the team's normal promotion path before previews fire
  on every PR.

## Verify

- Open a draft PR touching only `apps/forms`. No preview deploys. ✓
- Mark it ready for review. Preview comment appears with one URL for
  `forms-sandbox`. The other 3 apps are not touched. ✓
- Push another commit. The same comment updates (no new comments
  stacking up). The forms preview rebuilds. ✓
- Open a new PR touching `apps/landing` and `apps/chat`. Comment
  appears with 2 URLs. ✓
- Close the PR. Both branches are deleted from their respective
  Amplify apps. Confirm in the AWS console. ✓
- Open a PR that only touches `apps/api` or `packages/`. No frontend
  preview deploys (nothing affected). ✓

## Open questions

- **Branch name length / character restrictions.** Amplify branch
  names have constraints (length, allowed chars — slashes are allowed
  but the resulting subdomain replaces them with dashes). Some PR
  branches use long paths like
  `feat/landing-calculate-severance-pay-form` — should be fine, but
  worth confirming Amplify accepts them and the resulting subdomain
  works. Pass the branch name verbatim; if that breaks, fall back to
  `pr-<number>`.
- **Sticky comment mechanism.** Options:
  `marocchino/sticky-pull-request-comment` (mature, well-known) vs.
  rolling a small `gh api` snippet. Default to the action — it's the
  least surprising choice and handles the find-or-create logic.
- **Promotion path.** The workflow has to exist on both `sandbox` and
  `dev` for PRs targeting either to fire previews. Implementer should
  follow the team's normal promote/dev-to-sandbox flow rather than
  pushing the same file to both branches manually.
