# CLAUDE.md — .github

Workflows, the PR template and the CI helper scripts. Read the root `CLAUDE.md` first; this file
adds what is specific here.

## Pin GitHub Actions with the exact version comment, never a major alias

When SHA-pinning an action, the trailing comment must be the **exact release tag** the SHA resolves
to (`# v4.36.2`), never a moving major alias (`# v4`). zizmor's online `ref-version-mismatch` audit
resolves that comment against upstream and requires the tag to still point at the pinned SHA — a
major tag moves on every vendor release, so a `# vN` comment silently drifts and fails CI on a later,
unrelated PR. Resolve the exact tag with `git ls-remote --tags <repo>` (match the pinned SHA).
Dependabot already writes exact comments and bumps SHA+comment together. The `zizmor.yml` "Enforce
exact action version comments" step fails fast on any `# vN` comment.

## How the PR gate is wired (`ci.yml`)

- Runs on PRs to `main` and pushes to `main`. Build, Test and Lint use `nx affected` (base from
  `nx-set-shas`); Type Check is `pnpm lint:deps`, `pnpm exec tsc -b`, then
  `pnpm exec nx run landing:typecheck`.
- Nx excludes `**/*.md` from project inputs (`nx.json`), so markdown-only PRs make nothing
  "affected"; Validate Recipes, Validate Content and Generated Files Up To Date therefore run
  unconditionally.
- `generated-drift` regenerates `services-index.generated.ts` and `form-categories.generated.ts` and
  **commits them back onto the PR branch** with a GitHub App token instead of failing.
- `affected-apps` feeds the Docker Build matrix (`api`, `form-builder-api`, `chat-ingest`). Gating is
  step-level, so a skipped image still reports the required check green.
- Required checks come from the **"Main CI Required" ruleset**, not from the workflow. Adding,
  renaming or removing a job needs the ruleset changed too, or merges block (or silently lose a gate).

## The other workflows

- `pr-preview.yml` — Amplify previews for forms, landing, chat, form-builder and analytics; hosts the
  "Guard branch name" step (no `.`, 63-char label) and the forms smoke + a11y runs against the
  preview. These touch live environments; the hermetic gate is `ci.yml`.
- `forms-smoke.yml`, `forms-a11y.yml` — `workflow_call` reusables shared by the preview and deploy
  workflows.
- `deploy-sandbox.yml` → `deploy-staging.yml` → `deploy-prod.yml` fast-forward the pointer
  branches; prod is manual, dispatched from `staging`. Never edit those branches by hand.
- `zizmor.yml` — workflow security lint; `archive-merged-drafts.yml`, `assign-author-to-issues.yml`,
  `project-automation.yml` — event-driven housekeeping.
- `scripts/` holds the smoke, SSR and ECS verification helpers the workflows call.
