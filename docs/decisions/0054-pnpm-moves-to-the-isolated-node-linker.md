# 0054 — pnpm moves to the `isolated` node-linker; packages build in-place; containers use `pnpm deploy`

**Date:** 2026-06-12
**Status:** Accepted — supersedes [ADR 0002](./0002-pnpm-uses-hoisted-node-linker.md), retires the symlink scheme of [ADR 0003](./0003-containerised-api-needs-explicit-workspace-symlinks.md)

## Context

ADR 0002 kept pnpm in `hoisted` mode because the migration-time audit looked
expensive: packages leaned on dev-type packages (`@types/jest` et al.) hoisted
from sibling workspaces. It asked any successor to document how the audit cost
changed.

It changed completely. The Jest → Vitest migration removed the `@types/jest`
hoisting dependency entirely, and the sherif gate had already harmonized
declared versions. Flipping the linker and cold-building everything surfaced
the real remaining cost — and most of it traced back to two non-standard
layout choices, not to the linker:

1. **Packages built to a central `dist/packages/<pkg>`** while their
   `package.json` declared `main: ./src/index.js` — an entry point that never
   existed in the source tree. Resolution only worked through tsconfig paths
   plus hoisting accidents.
2. **Containers copied `node_modules` wholesale** and hand-maintained symlink
   loops (ADR 0003) to make Node's upward module walk find workspace packages.

## Decision

Three aligned changes, all toward the standard pnpm-monorepo shape:

- **`nodeLinker` is removed** — pnpm's default `isolated` linker applies.
  Packages resolve only what they declare.
- **Packages build in-place**: `@nx/js:tsc` `outputPath` is
  `packages/<pkg>/dist` (with `rootDir: packages/<pkg>`), matching the
  tsconfig `outDir` the repo already had, and `package.json` entries are
  truthful: `main: ./dist/src/index.js`, `types: ./dist/src/index.d.ts`.
  A package directory is now self-describing — its manifest, source, and
  build output travel together.
- **The api and form_builder_api images are assembled with `pnpm deploy`** —
  pnpm's purpose-built command for containerizing one workspace app. It
  produces a self-contained tree (app source + compiled `dist/` +
  materialized `node_modules` including workspace packages as real
  directories). The runner stage is a single `COPY`. ADR 0003's generated
  symlink loops are deleted.

## What the audit actually found

- Four phantom deps, now declared where used: `zod` (form-validation),
  `dotenv` + `json-logic-js` (api), and `tslib`.
- `tslib` is a **runtime dependency of every package compiled with
  `importHelpers`** (all of them) — declared in each buildable package and
  both node apps. A `--prod` deploy without it crashes at require time.
- TS2742 declaration-portability errors in form_builder_api — fixed with
  explicit `Router`/`Express` annotations on exported consts.
- pnpm 11 verifies workspace dep status before running scripts; that check
  is meaningless in a deployed image, so the api runner sets
  `pnpm_config_verify_deps_before_run=false` for the migrate-task.
- The migrate-task's `tsconfig-paths/register` follows
  `extends: ../../tsconfig.base.json` from `/app`; the base config is parked
  at `/tsconfig.base.json` in the image. Its `paths` targets don't exist
  there, so tsconfig-paths falls back to normal node_modules resolution.

## Consequences

- A missing dependency declaration fails the build loudly instead of working
  until a hoisting accident stops covering for it.
- New packages need no Dockerfile edits — `pnpm deploy` materializes
  whatever the app's dependency graph declares (the #412 failure class is
  structurally gone, not just guarded).
- `packages/<pkg>/dist` is gitignored build output; the central `dist/` only
  holds app build artifacts that haven't moved in-package yet.
- Verified at migration time: cold `nx run-many -t build` (13 projects),
  repo-wide `tsc -b`, full Vitest suite, sherif, api image boots to config
  validation and its migrate-task reaches the database-connection stage,
  form_builder_api image boots and listens.
