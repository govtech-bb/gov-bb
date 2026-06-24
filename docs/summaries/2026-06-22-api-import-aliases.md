# `apps/api` deep relative imports → `@/` aliases — Implementation Session

**Date:** 2026-06-22
**Branch:** `worktree-api-import-aliases-1385`
**Issue:** #1385
**Plan:** `docs/plans/1385-replace-deep-relative-imports-with-aliases.md`

## Context

Since the switch to AI-driven design the codebase accumulated brittle deep
relative imports (`../../../../foo`). #1385 tracks resolving these into `@`
aliases repo-wide, one app per PR for reviewability. `apps/api` was picked
first: most deep imports (92 across 43 source files, some 4 levels deep) and
the riskiest resolver config — a strict `@nx/js:tsc` composite build plus a
Vitest/swc test runner, neither of which had an `@/` alias yet.

## What we did

- **Added `@/* → ./src/*`** to `apps/api/tsconfig.json`, and the matching
  `@/` regex alias to `apps/api/vitest.config.ts` (alongside the existing
  `@govtech-bb/*` one).
- **Rewrote all 92 deep (`../../`+) specifiers** in `apps/api/src/**` to
  `@/...` via a scripted codemod (resolve each against `src`, rewrite to
  `@/<rel-from-src>`). Single-level `../foo` imports left alone (out of scope).
  All targets resolved inside `src` — these are in-app modules (`database`,
  `common`, `expressions`, `files`, `registry`, `payments`, `email`, `config`);
  note `apps/api/src/database` is the in-app module, *not* the
  `@govtech-bb/database` package, so it correctly became `@/database/...`.
- **Verified:** `nx run api:build`, `tsc -b apps/api` (exit 0, typechecks
  specs), `nx run api:test` (871 pass, coverage thresholds met), and
  `nx run-many -t build --exclude=landing,cms` (all 15 projects).

## Why we did it that way

- **`baseUrl: "."` had to be added to the api tsconfig — the non-obvious part.**
  `apps/api/tsconfig.json` extends `tsconfig.base.json`, which sets
  `baseUrl: "."` at repo root. TS resolves `paths` relative to the *inherited*
  baseUrl, so the first attempt (`@/*: ["./src/*"]` with no local baseUrl)
  resolved to `<repo-root>/src/*` and the build failed with `TS2307` plus a
  cascade of `TS2339 Property X does not exist` errors — those were red
  herrings: subclasses lost their inherited members only because the base-class
  import (`@/database/base.repository`) hadn't resolved. Setting `baseUrl: "."`
  in the child makes paths resolve relative to `apps/api`. `landing`/`chat` never
  hit this because they don't extend the base config.
- **Re-declared the `@govtech-bb/*` paths in the child.** A child `paths` block
  *replaces* (not merges) the inherited one, so dropping in only `@/*` would
  have orphaned the `@govtech-bb/*` mappings. They're re-listed with `../../`
  prefixes (correct now that baseUrl is the app dir).
- **Codemod over hand-editing** because the rewrite is purely mechanical and
  92-wide; the build + `tsc -b` + full test suite are the safety net that the
  rename preserved behaviour.

## Open questions

None for `apps/api`. The remaining apps follow as separate PRs under #1385:
`form_builder` next (also lacks `@/` and adds a Vite `resolve.alias`), then
`landing`/`chat`/`forms`/`form-validation` which only need import rewrites
(aliases already exist).

## Notes

- `api:lint` is pre-existing-red (63 errors, none import-related — verified by
  stashing); the gate is build + tests per CLAUDE.md, so it was left untouched.
