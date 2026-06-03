# 0032 — pnpm uses the default `isolated` node-linker

**Date:** 2026-06-03
**Status:** Accepted — supersedes [ADR 0002](./0002-pnpm-uses-hoisted-node-linker.md) and [ADR 0003](./0003-containerised-api-needs-explicit-workspace-symlinks.md)

## Context

ADR 0002 adopted `node-linker=hoisted` during the npm→pnpm migration because
several packages relied on dev-types (`@types/jest` etc.) hoisted from sibling
workspaces, and auditing every package was out of scope for a package-manager
swap. ADR 0003 then layered workspace symlinks into the containerised api
because the hoisted flat `node_modules` doesn't carry workspace packages to
the image root.

An audit (issue #720) found the original blocker had dissolved: under
`nodeLinker: isolated`, `pnpm install`, the full nx build, and repo-wide
`tsc -b` all pass once each workspace declares what it actually uses. What
still depended on the hoisted layout was deployment, not the build:

- the api and form_builder_api runner images bulk-`COPY`'d the flat root
  `node_modules` and hand-built `@govtech-bb/*` symlinks (the #412
  MODULE_NOT_FOUND / silent-rollback failure class),
- `amplify.yml` cached `node_modules/**/*`, which doesn't survive restore as
  a symlink forest.

## Decision

**Remove `nodeLinker: hoisted` — use pnpm's default `isolated` linker.**

Alongside the flip:

- Every workspace declares its real dependencies (phantom deps eliminated:
  `zod` in form-validation, `rxjs`/`class-validator`/etc. in apps/api, jest
  toolchain per test-running package, and so on).
- The two compiled-API runner images are assembled with
  `pnpm deploy --legacy`, which produces a self-contained project copy with
  the full resolved graph — no symlink lists to maintain. Compiled workspace
  JS (`dist/packages/<name>/src`) is overlaid into the deployed copies since
  workspace packages declare `main: ./src/index.js`.
- Amplify caches the pnpm store (`.pnpm-store`) instead of `node_modules`;
  installs relink from the store.

## Consequences

- A package that imports something it doesn't declare now fails at
  install/build instead of silently working via a sibling's hoist — the
  strictness ADR 0002 traded away is restored.
- Adding a workspace package no longer requires touching any Dockerfile;
  `pnpm deploy` derives the runtime tree from the dependency graph (closes
  the ADR 0003 drift class for good).
- `TS2742` ("inferred type cannot be named… not portable") can surface in
  strict-tsc packages under isolated symlinks; the fix is an explicit type
  annotation on the exported value (see form_builder_api's routers).
- The ECS migrate-task runs apps/api's own `migration:run` script from the
  image workdir `/app/apps/api`; ts-node and typescript are therefore real
  devDependencies of apps/api and dev deps are included in its deploy output.
