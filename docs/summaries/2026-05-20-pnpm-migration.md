# npm → pnpm migration — Session Summary

**Date:** 2026-05-20
**Branch:** chore/migrate-to-pnpm
**PR:** https://github.com/govtech-bb/gov-bb/pull/10
**ADR:** [docs/decisions/0002-pnpm-uses-hoisted-node-linker.md](../decisions/0002-pnpm-uses-hoisted-node-linker.md)

## What was built

Replaced npm with pnpm@10.33.4 as the monorepo's package manager. Touched the root config (`package.json`, new `pnpm-workspace.yaml`, new `.npmrc`), the workspace-dep declarations in `apps/api` and `apps/web`, the husky hooks, `amplify.yml`, the GitHub Actions CI workflow, and the README. Lockfile swapped from `package-lock.json` to `pnpm-lock.yaml`. No behavioural changes; the goal was a clean PM swap to unblock the upcoming containerisation work.

## Why it looks the way it does

**`node-linker=hoisted` instead of pnpm's default `isolated`.** First `pnpm install` succeeded, but `pnpm exec nx run-many -t build` failed in `packages/form-conditions` and `packages/form-validation` with `Cannot find name 'expect'` (TS) and a wave of `TS7006` implicit-any errors. Root cause: `packages/form-conditions/tsconfig.json` declares `"types": ["jest"]` but the package doesn't list `@types/jest` in its own `package.json`. npm workspaces had been hoisting `@types/jest` from `apps/api`'s devDeps to the root, where TS module resolution found it. pnpm's `isolated` linker doesn't do that.

The principled fix (audit and declare dev-types per-package) was out of scope for a PM swap. `.npmrc` with `node-linker=hoisted` makes pnpm produce a flat `node_modules/` tree, matching what the code already assumes. The constraint and the path back to strict mode are documented in [ADR 0002](../decisions/0002-pnpm-uses-hoisted-node-linker.md) so this isn't an invisible decision.

**`"workspace:*"` for internal deps, not `"*"`.** Same `pnpm install` failure trail surfaced this: `@govtech-bb/form-conditions` was listed as `"*"` in `apps/api` and `apps/web`. npm workspaces silently resolved that to the in-repo package; pnpm tried to fetch it from the npm registry and 404'd. Switching to the explicit `workspace:*` protocol resolves it locally. Five declarations updated (3 in `apps/api`, 2 in `apps/web`). The shared packages themselves don't depend on each other, so no further changes were needed.

**`amplify.yml` installs pnpm via `npm install -g pnpm@10.33.4`, not corepack.** Corepack is the modern path but the Amplify build environment has historically had signature-verification issues with corepack on its Amazon Linux image. `npm install -g` is one extra line in `preBuild` and is bulletproof on any Node image. The README documents corepack as an alternative for local dev where the toolchain is more flexible.

**`.github/workflows/ci.yml` uses `pnpm/action-setup@v4` + `cache: "pnpm"`.** Standard pattern for pnpm in GitHub Actions — reads the `packageManager` field from `package.json` and pins the same version everywhere. Three jobs (`typecheck`, `test`, `build`) got the same treatment.

**`.github/workflows/deploy-sandbox.yml` was intentionally not touched.** Line 86 (`"command":["npm","run","migration:run"]`) runs *inside* the production api container in ECS. Changing it would mean the api image (built by the `apps/api/Dockerfile`) needs to either keep npm around or be rebuilt to use pnpm. That's coupled to the Dockerfile change and belongs in the next PR (containerisation). Flagged in this PR's body so the reviewer doesn't think it was missed.

**Build-script approval warning left as-is.** pnpm 10 ignores postinstall scripts by default (`@nestjs/core`, `@scarf/scarf`, `nx`, `protobufjs`, `unrs-resolver`) and prints a yellow box on every install. Verified all builds/tests pass without any of them running. Approving them is its own decision the team should form an opinion on; gating this PR on that would widen scope. Follow-up item.

## Decisions worth flagging

- **The `node-linker=hoisted` choice is now load-bearing for adding new packages.** New packages don't need to declare transitively hoisted dev-types — they will keep working the same way npm did. Documented in ADR 0002. Any future "let's move to strict isolation" effort needs to plan for an audit-and-declare sweep across every `tsconfig.json` that uses `types: [...]`.
- **`workspace:*` is now the only correct way to declare internal deps.** A new package depending on `@govtech-bb/expressions` (etc.) must use `"workspace:*"`, not `"*"` or a version range. Worth a CONTRIBUTING note if/when one exists.
- **Build-script approval policy is unresolved.** Options when someone gets to it: explicit `onlyBuiltDependencies` allow-list in root `package.json` (recommended for `nx` only — its postinstall configures the daemon and is useful), allow all (matches old npm behaviour, less safe), or leave it (warning is harmless).

## Key files

| File | Change |
|------|--------|
| `package.json` | `packageManager: "pnpm@10.33.4"`; removed `workspaces` field; `lint-staged` and `migration:create:help` swept from `npx` → `pnpm exec` |
| `pnpm-workspace.yaml` | New — lists `apps/*` and `packages/*` |
| `.npmrc` | New — `node-linker=hoisted` (see ADR 0002) |
| `package-lock.json` | Deleted |
| `pnpm-lock.yaml` | New |
| `apps/api/package.json` | Internal deps `"*"` → `"workspace:*"` (3); lint-staged `pnpm exec` |
| `apps/web/package.json` | Internal deps `"*"` → `"workspace:*"` (2); lint-staged `pnpm exec` |
| `.husky/pre-commit`, `.husky/pre-push` | `npx` → `pnpm exec` |
| `amplify.yml` | `npm install -g pnpm@10.33.4` + `pnpm install --frozen-lockfile --ignore-scripts`; build steps use `pnpm exec nx run …` |
| `.github/workflows/ci.yml` | `pnpm/action-setup@v4` + `cache: "pnpm"` + `pnpm install --frozen-lockfile` across `typecheck`/`test`/`build` jobs |
| `README.md` | Prereqs, script table, Nx examples, migration command examples, toolchain-divergence note |
| `docs/decisions/0002-pnpm-uses-hoisted-node-linker.md` | New — records the linker decision |

## Verification

Local (Apple Silicon M-series, Node 26, pnpm 10.33.4):
- `pnpm install` — 33s, hoisted layout produced, 7 workspace projects detected
- `pnpm exec nx run-many -t build` — 7/7 projects build
- `pnpm exec tsc -b` — clean, exit 0
- `pnpm exec nx run-many -t test` — 7/7 projects, **307 tests** passing across the api alone (full suite green)
- Husky `pre-commit` (`pnpm exec lint-staged --concurrent false`) and `pre-push` (`pnpm exec tsc -b`) hooks fire and pass

CI will independently re-run typecheck/test/build on the new pnpm setup. The first Amplify build after merge is the highest-risk verification — it's the only place the `npm install -g pnpm@10.33.4` + `pnpm install --frozen-lockfile` flow runs end-to-end against the Amplify image.

## Follow-ups for the next session

- **Containerisation PR (PR #2):** Dockerfiles for api/landing/web, `docker-compose.yml` + `docker-compose.dev.yml`, `apps/api/src/database/seed.ts`, `.env.docker.example`, README "Running with Docker" section, and the update to `deploy-sandbox.yml:86` (`npm` → `pnpm`).
- **Optional:** decide whether to approve any of the ignored build scripts (`nx` is the only one with a useful postinstall).
- **Optional / long horizon:** plan a strict-isolation migration (`node-linker=isolated`), declaring dev-types per-package. Tracked by ADR 0002.
