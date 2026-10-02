# 0004 — pnpm uses the default (isolated) node-linker

**Date:** 2026-09-21
**Status:** Accepted — supersedes [ADR 0002](./0002-pnpm-uses-hoisted-node-linker.md); amends [ADR 0003](./0003-containerised-api-needs-explicit-workspace-symlinks.md)

## Context

ADR 0002 kept pnpm's `hoisted` linker during the npm → pnpm migration so that
packages relying on hoisted `@types/jest` kept compiling. That reason is gone:
Jest was removed, and the type packages the `types` arrays reference today
(`vitest/globals`, `node`) are root devDependencies, which TypeScript finds by
walking up to the root `node_modules` under either linker.

What the flat layout still did was hide dependency mistakes. A package could
import something it never declared and work because a sibling had pulled it
in. The known cases at the time of this change:

- `packages/form-validation` imported `zod` without declaring it.
- `packages/form-conditions` imported `@govtech-bb/form-types` without declaring it.
- `apps/form_builder_api` specs imported `@aws-sdk/client-bedrock-runtime` and `@tanstack/ai-client` without declaring them.
- Every compiled package required `tslib` at runtime (`importHelpers: true` in `tsconfig.base.json`) and none declared it; the Docker runners only worked because a transitive dependency happened to hoist it.
- Two `@smithy/types` releases existed in the lockfile; hoisting collapsed them onto one copy, so a type-identity mismatch in `apps/api` specs never surfaced.

## Decision

`pnpm-workspace.yaml` no longer sets `nodeLinker`; the workspace installs with
pnpm's default isolated layout. A project can only resolve what it declares
(plus the root project's own dependencies, which sit in the root `node_modules`).

Changes that made this hold:

1. **Declared the phantom dependencies** listed above; dropped `importHelpers`
   so compiled output inlines its helpers instead of requiring `tslib`; pinned
   `@smithy/types` to a single copy through the existing `overrides` block.
2. **Library builds emit into their own directory.** `@nx/js:tsc` `outputPath`
   is now `packages/<name>/dist` (was `dist/packages/<name>`). Dependants read a
   library's declarations from there, and any external type those declarations
   reference (`zod`, `luxon`, …) resolves from the library's own
   `node_modules`. From the old workspace-level `dist/`, resolution walked up to
   the root and found nothing.
3. **The api compiles into `apps/api/dist`** (was `dist/apps/api`) for the same
   reason at runtime: `nx dev api` and `nx start api` run the compiled entry
   with plain Node, which must find `@nestjs/core` and friends by walking up to
   `apps/api/node_modules`. `form_builder_api` already worked this way. The
   `dev:api` / `start:api` scripts symlink `apps/api/node_modules/@` for the
   in-app `@/*` alias accordingly.
4. **Docker runners keep their flat layout.** Only the `prod-deps` stage of
   `apps/api/Dockerfile` and `apps/form_builder_api/Dockerfile` passes
   `--config.node-linker=hoisted`, because the runner resolves everything from
   a single `/app/node_modules`. The lockfile is linker-agnostic, so this is a
   layout choice for the image, not a different dependency graph. The builder
   stage gathers each `packages/<name>/dist` into `dist/packages/<name>` so the
   runner's symlink loop from ADR 0003 is unchanged.
5. **Amplify caches the pnpm store** (`.pnpm-store/**/*`, installs run with
   `--store-dir .pnpm-store`) instead of `node_modules/**/*`. An isolated
   `node_modules` is a forest of relative symlinks that does not survive a
   glob-based cache restore reliably; relinking from a cached store is fast and
   deterministic.

## Consequences

- An undeclared import now fails at build or type-check time in CI instead of
  at runtime in a filtered Docker install. Declare the dependency in the
  project that uses it; do not add it to the root to make it resolve.
- `pnpm install` of a single project (`--filter`) yields a correct tree.
- ADR 0003's symlink loop still applies to the runner stages; its rationale
  ("workspace packages are linked per consumer") now also describes the
  workspace itself, and the runtime layout it relies on is produced by the
  `prod-deps` stage explicitly.
- Two `@aws-sdk/*` release generations coexist (3.1073 and 3.1085). Aligning
  them removes the need for the `@smithy/types` override; until then the
  override keeps the type identity single.
- Verified in a clean-room worktree outside the repository tree (nested
  worktrees resolve into the parent's `node_modules` and false-pass this kind
  of change): full workspace build, `tsc -b`, tests, lint, both production
  images built and their module graphs loaded, `nx dev api` resolution.
