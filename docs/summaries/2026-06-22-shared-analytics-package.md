# Shared `@govtech-bb/analytics` package — Implementation Session

**Date:** 2026-06-22
**Branch:** `worktree-dup01-shared-analytics`
**Issue:** #1394 (DUP-01)
**Plan:** `docs/plans/1394-dup-shared-analytics.md`

## Context

`apps/forms` and `apps/landing` each carried a byte-for-byte copy of a thin
Umami wrapper — the same `declare global { interface Window { umami } }`
augmentation plus `trackEvent(name, data?)` and `trackPageview()` (only quote
style differed); landing additionally exported `deriveStartEventName`. The two
spec files were near-duplicates too. A change to the Umami contract (consent
gating, a new `track` signature) had to be mirrored in two places, and drift
would silently break analytics in one app.

## What we did

- **New buildable package `@govtech-bb/analytics`** (`packages/analytics/`),
  cloned from the `form-types` pattern: `project.json` with an `@nx/js:tsc`
  build target, a `composite` `tsconfig.json`, and a `vitest.config.ts` (jsdom
  environment, 98% coverage thresholds, the `@govtech-bb/*`→src alias). It
  exports `trackEvent`, `trackPageview`, `deriveStartEventName`, and the ambient
  `Window.umami` typing.
- **Both apps' `src/lib/analytics.ts` became one-line `export *` shims** of the
  package, so all ~20 existing `from "../lib/analytics"` call sites stayed
  untouched. The two duplicate app specs were deleted; one consolidated spec
  lives in the package (it also adds SSR-guard cases the old forms spec lacked).
- **Wiring:** `workspace:*` dep in both apps; `@govtech-bb/analytics` path in
  `tsconfig.base.json` + a project `reference` in `apps/forms/tsconfig.json`;
  and a **local** path entry in `apps/landing/tsconfig.json` (see below).

## Why we did it that way

**A dedicated package, not folded into `@govtech-bb/react`.** The plan weighed
adding it to the design-system package (it is a frontend concern) but analytics
isn't UI — a standalone package keeps the design system focused and lets a
third consumer (`chat`'s turn-metrics telemetry) adopt it later without pulling
in React. This was a judgement call, not a new codebase-wide principle, so no
ADR (see Notes).

**Landing needed its own tsconfig path mapping.** The non-obvious cost of the
session: the two apps resolve `@govtech-bb/*` differently. `forms` extends
`tsconfig.base.json` and uses tsc project references. `landing` does **not**
extend the base and has no references — it resolves *published* packages
(`@govtech-bb/react`, `@govtech-bb/design`) via node_modules dist. A new
*workspace-source* package has no published dist (its compiled output is
gitignored), so it won't resolve in landing from the base path alone. The fix
was a local `"@govtech-bb/analytics": ["../../packages/analytics/src/index.ts"]`
entry in `apps/landing/tsconfig.json`, which landing's Vite picks up via
`resolve: { tsconfigPaths: true }` and bundles from source.

**Ambient global propagation verified early** (the plan's flagged risk). The
`declare global` lives in the package's module `index.ts`, so it merges into any
program that imports the module. Confirmed by a clean `tsc -b` and a landing
typecheck with no analytics-related errors. In practice no app code references
`window.umami` directly (only the package does), so propagation isn't even
load-bearing — but it resolves correctly regardless.

## Verification

- `nx run-many -t build -p analytics,forms` → success (forms pulls analytics
  through project references, proving the strict-tsc declaration flow).
- `nx run-many -t test -p analytics,forms` → analytics 11 pass / 100% coverage;
  forms 735 pass / 1 skipped.
- `nx run landing:test` → 146 pass.
- `tsc -b` → rc 0.
- `landing typecheck` → only a **pre-existing** `vite.config.ts` /
  `NitroPluginConfig` error (verified identical on clean `origin/sandbox`);
  no analytics-related error.

## Notes

- No new ADR: choosing a dedicated package over `@govtech-bb/react` is a scoped
  refactor decision, not a principle that constrains future work.
- Pre-existing and out of scope: `deriveStartEventName` has no live callers in
  either app (only referenced in `apps/landing/README.md`) — it was already
  export-only on `origin/sandbox`, so it was preserved as-is, not deleted.
- `nx run-many` can hang silently the first time it sees a brand-new project
  (graph recompute); ran everything with `NX_DAEMON=false`.
