# Phase 1 — Coverage Tooling

**Branch:** `testing/coverage`  
**Commits:** `38024d6` → `d63511d`

## Context

The testing improvements plan (created this session from the coverage analysis) identified that no workspace in the monorepo collected coverage metrics. Estimated percentages in the analysis were guesses from code inspection. Phase 1 was scoped to wire up `collectCoverage` and thresholds so every test run produces real numbers and CI fails on regressions.

## What we did

- Added `collectCoverage`, `collectCoverageFrom`, `coverageReporters`, and `coverageThreshold` to all five Jest configs: `apps/api`, `apps/web`, `packages/form-conditions`, `packages/form-validation`, `packages/form-types`
- Added `"test": "jest --config jest.config.ts"` to the three package `package.json` files (they had no test script)
- Added `"test:all": "nx run-many -t test"` to root `package.json`
- Fixed a pre-existing bug in `packages/form-validation/src/rules/number.spec.ts`: the `cfg` helper was passing `reference` as a key but the runners expect `referenceFieldId` — cross-field number tests were silently passing wrong data

## Why we did it that way

**Threshold values diverged from the plan.** The plan specified aspirational thresholds (90% for mature packages, 70–75% for API). When actual measurements ran, several metrics fell short: API branches were 60.97% against a 70% threshold, form-conditions branches 84.9% against 90%, and form-types functions 6.52% against 50%. Setting thresholds above actuals would have broken CI immediately. We followed the same pattern used for `apps/web` (which had only 1 spec file) and set each threshold 1–2 points below the measured value. See [decision record 0001](../decisions/0001-coverage-thresholds-track-actuals-not-targets.md) for the principle.

**`apps/web` thresholds are very low by design.** The web Jest suite has one spec file covering the TanStack Query caching layer. `collectCoverageFrom` captures all 29 `.ts` files in `src/`, so measured coverage is ~22% statements and ~2% functions. The thresholds (statements: 20, functions: 1, lines: 15, branches: 0) are a measurement floor, not a quality statement. They will rise as Phase 3 adds React component unit tests.

**`testEnvironment: "node"` was not changed for `apps/web`.** The plan defers the `jsdom` switch to Phase 3 when React Testing Library is added. Mixing that infrastructure change into Phase 1 would have made the threshold calibration harder to reason about.

**`form-validation/project.json` needed a test target.** The other packages already had Nx test targets; form-validation was missing one, which prevented `npx nx run form-validation:test` from working. Added as part of Task 3.

## Open questions

- The `expressions` package picked up the `test:all` run even though it has no coverage config. It passes today (25 tests), but if its missing packages (`json-logic-js`) get installed, it could start failing. Worth adding a coverage config to `packages/expressions` in a follow-up.
- API branch coverage (60.97%) is notably lower than statement/line coverage (~74%). This gap suggests conditional branches in untested controller and filter code — consistent with the Phase 2 targets (GlobalExceptionFilter, FormDraftsController).
