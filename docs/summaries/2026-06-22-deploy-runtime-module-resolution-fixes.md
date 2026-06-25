# Deploy runtime module-resolution fixes (API `@/`, form-builder git-publish) — Debugging Session

**Date:** 2026-06-22
**Branch:** `worktree-deploy-runtime-resolution-fixes`
**Issue:** none referenced (no matching open issue found)
**Trigger:** failed Deploy Sandbox run [27969025776](https://github.com/govtech-bb/gov-bb/actions/runs/27969025776)

## Context

The sandbox deploy showed two red jobs — **Deploy API** and **Deploy form-builder**.
Both *build and push their images successfully*, then fail at the verify/stabilize
step with the ECS deployment circuit breaker rolling the deployment back. The CI
errors ("Waiter ServicesStable failed: Max attempts exceeded" / "Deployment …
not found after stabilization") are symptoms, not causes.

CloudWatch (`aws logs tail /ecs/<svc> --since 40m`) showed the real cause: the
freshly-built containers crash-loop on startup with Node `MODULE_NOT_FOUND`:

- **API** (`/ecs/modular-forms-api-sandbox`): `Cannot find module '@/database/base.repository'`
- **form-builder** (`/ecs/form-builder-sandbox`): `Cannot find module '@govtech-bb/git-publish'`

Because the circuit breaker keeps the *prior* image serving, the live sites stay
up — so every deploy reports failure while masking that no new code ships. The
API's own Dockerfile already documents this exact masking behaviour from #412.

## What we did

Two Dockerfile fixes (no application code touched):

- **`apps/form_builder_api/Dockerfile`** — replaced the hard-coded
  `@govtech-bb/*` symlink list with the loop the API Dockerfile already uses
  (`for pkg_dir in packages/*/; do … ln -sfn …`). The new `@govtech-bb/git-publish`
  package's compiled output is already copied into `packages/` (the
  `COPY /app/dist/packages/`), so the loop now symlinks it automatically — and
  any future workspace package too. Also added the missing `git-publish` line to
  the explicit package-manifest COPY block, for parity with the other packages.
- **`apps/api/Dockerfile`** — added `RUN ln -sfn ../dist/src node_modules/@` so
  the literal `require("@/…")` left in the compiled output resolves at runtime
  (`@/database/base.repository` → `dist/src/database/base.repository.js`).

## Why we did it that way

**Two independent regressions, one symptom.** They surfaced together in one run
but have separate root causes from separate refactors merged to sandbox:
- #1385 (`refactor(api): replace deep relative imports with @ path aliases`)
  converted 43 `apps/api/src` files to the `@/*` alias. `@/*` → `./src/*` is a
  *compile-time* tsconfig mapping; nothing rewrites it at runtime (the CMD is a
  plain `node dist/src/main.js`, the build is `@nx/js:tsc` with no `tsc-alias`,
  and `tsconfig-paths/register` is wired only for the migration scripts). So the
  compiled JS keeps a bare `require("@/…")` that Node can't resolve.
- #1400 (`extract shared @govtech-bb/git-publish client`) added a new workspace
  package imported by `publish.ts`, but the form-builder Dockerfile's symlink
  list was hand-maintained and never updated.

**Symlinks, not a runtime path-resolver, for the API `@/`.** Matches the
approach the workspace packages already use in both Dockerfiles, and keeps the
runtime CMD untouched — no `tsconfig-paths/register` on the hot path, no
post-build `tsc-alias` step. Node's CJS resolver treats `@/database/base.repository`
as package `@/database` + subpath `base.repository`; with `node_modules/@`
symlinked to `dist/src`, it lands on `dist/src/database/base.repository.js`.
Verified the mechanic in isolation (mock layout) before editing — see below.

**Loop over hard-coding for form-builder.** This is the second time a
hand-maintained `@govtech-bb/*` symlink list has caused a circuit-breaker-masked
deploy failure (first was #412 on the API, which is *why* the API switched to a
loop). Propagating the loop to form-builder removes the whole class of bug
rather than just adding the one missing entry.

## Verification

- **Cannot build the Docker images locally** (no docker socket in this shell);
  the definitive test is the CI Docker build + ECS deploy on push.
- Reconstructed both runtime layouts in a scratch dir and proved Node resolves
  them: `node_modules/@ → ../dist/src` resolves `require("@/database/base.repository")`,
  and the `packages/*/` loop symlinks `@govtech-bb/git-publish` so
  `require("@govtech-bb/git-publish")` resolves via its `main: ./src/index.js`.
  Both passed.
- Confirmed `git-publish` is emitted to `dist/packages/git-publish/`
  (package.json + src) by nx, so the loop's `-f package.json` guard picks it up.
- Dockerfile-only change → `nx build`/tests don't exercise it; not run.

## Notes

- No ADR: bug fix propagating an existing convention (#412's "generate symlinks,
  don't hand-maintain a list"), not a new principle.
- Left the form-builder build-stage install layer untouched — the CI build
  already succeeds; only the runtime symlink + manifest were broken.
- Worktree was based on `origin/sandbox` (tip `fafbfc24`), not local HEAD —
  local was behind and didn't yet contain the `@/` aliases.
