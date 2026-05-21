# Test Coverage Evaluation — Post-Implementation Update

**Date:** 2026-05-20  
**Analyst:** Claude (AI-assisted review)  
**Branch:** `testing/coverage`  
**Scope:** Full codebase — packages, API, and web app  
**Supersedes (estimates only):** `docs/testing/2026-05-19-coverage-analysis.md`

---

## 1. Executive Summary

All four phases of the testing improvements plan (`docs/superpowers/plans/2026-05-19-testing-improvements.md`) have been completed on branch `testing/coverage`. Coverage collection is now live across all five workspaces, and real measured numbers replace the prior code-inspection estimates.

The project target is **90% across statements, branches, functions, and lines** for every workspace. One workspace (`packages/form-validation`) is at or above target on all metrics. Four are not.

| Workspace | Statements | Branches | Functions | Lines | At 90% Target? |
|---|---|---|---|---|---|
| `packages/form-conditions` | 94.93% | 86.79% | 100% | 97.26% | Branches −3.21pp |
| `packages/form-validation` | 94.75% | 90.15% | 96% | 97.26% | **Yes** |
| `packages/form-types` | 60.15% | 100% | 6.52% | 61.78% | Statements −29.85pp, Lines −28.22pp, Functions* |
| `apps/api` | 81.08% | 63.9% | 71.74% | 80.56% | Branches −26.1pp, Functions −18.26pp |
| `apps/web` | 23.61% | 11.74% | 8.46% | 21.03% | All metrics significantly below |

*`packages/form-types` function coverage (6.52%) is a structural artefact of the package's schema-first design — see §5.3.

**Three findings stand out:**

1. `apps/api` branch coverage (63.9%) is the most immediately addressable quality risk — untested conditional branches include error-handling paths in the exception filter, repository transaction rollbacks, and metric recording conditionals.
2. `apps/web` unit test coverage is low across the board (23.61% statements, 8.46% functions). This reflects the intentional deferral of complex component tests during Phase 3 and the denominator effect of all `.tsx` files entering `collectCoverageFrom`. Reaching 90% requires a sustained Phase 5 effort on the web component layer.
3. `packages/expressions` has no coverage configuration at all. It runs 25 tests via `test:all` but is invisible to the quality gate.

The forward work is specified in `docs/superpowers/plans/2026-05-20-testing-phase5.md`.

---

## 2. Coverage Tools and Configuration

### 2.1 What Is Configured

**Test runner:** Jest with `ts-jest` across all workspaces. Each workspace has `collectCoverage: true`, a `collectCoverageFrom` exclusion list, `coverageReporters: ["text-summary", "lcov", "html"]`, and a `coverageThreshold` block.

**E2E runner:** Playwright (Chromium only) for `apps/web`. E2E tests contribute to user-journey confidence but not to numeric coverage — Playwright coverage instrumentation is not yet enabled.

**Running coverage:**

```bash
# All workspaces via Nx
npm run test:all

# Single workspace
npx nx run api:test
npx nx run web:test
npx nx run form-conditions:test
npx nx run form-validation:test
npx nx run form-types:test
```

Reports land in `<workspace>/coverage/` — `lcov.info` for CI tooling, `index.html` for local browsing.

### 2.2 Current Thresholds

Thresholds are set ~2 points below measured actuals per [decision record 0001](../decisions/0001-coverage-thresholds-track-actuals-not-targets.md): they enforce against regressions, not aspirational targets.

| Workspace | Statements | Branches | Functions | Lines | Source |
|---|---|---|---|---|---|
| `packages/form-conditions` | 93 | 85 | 98 | 95 | `jest.config.ts` |
| `packages/form-validation` | 90 | 85 | 90 | 90 | `jest.config.ts` |
| `packages/form-types` | 58 | 98 | 5 | 59 | `jest.config.ts` |
| `apps/api` | 79 | 62 | 70 | 79 | `jest.config.ts` |
| `apps/web` | 21 | 10 | 7 | 19 | `jest.config.ts` |

**Note:** The `form-validation` branches threshold (85) is lower than the measured actual (90.15%). This should be raised before merging.

### 2.3 Missing Infrastructure

- **`packages/expressions` — no coverage config.** The package has `jest.config.ts` but no `collectCoverage` or `coverageThreshold`. It participates in `test:all` but produces no numbers and enforces no floor.
- **No CI coverage integration.** Reports are produced locally but not uploaded to any service. No PR-level coverage delta comment, no historical trend, no badge.
- **No Playwright coverage instrumentation.** E2E paths are not reflected in numeric coverage. Istanbul/v8 instrumentation for TypeScript requires additional build tooling.
- **`apps/api/src/form-builder/**` excluded.** The Jest config explicitly excludes the form-builder AI module (`!**/form-builder/**`) — this area carries no coverage obligation until the follow-up task is scheduled.

---

## 3. What Was Implemented (Phases 1–4 Recap)

### Phase 1 — Coverage Tooling
Added `collectCoverage`, `collectCoverageFrom`, `coverageReporters`, and `coverageThreshold` to all five Jest configs. Added `"test"` scripts to the three package `package.json` files that lacked them. Added `"test:all": "nx run-many -t test"` at the root. Fixed a silent bug in `form-validation/number.spec.ts` where `reference` was passed instead of `referenceFieldId`, causing cross-field number tests to silently use wrong input data.

### Phase 2 — High-Priority API Gaps
Created:
- `exception.filter.spec.ts` — `GlobalExceptionFilter` with OpenTelemetry span recording and `MetricsService` paths.
- `form-drafts.controller.spec.ts` — all four CRUD controller routes plus `NotFoundException` propagation.
- `payment-reference.spec.ts` — UUID v4 format and distinctness.
- Added the `draftId = undefined` branch to `submission-pipeline.service.spec.ts`.

API statements rose from ~73% to 79.23%.

### Phase 3 — Scoped Web Unit Tests
Installed `jest-environment-jsdom`, React Testing Library, `jest-axe`. Created `apps/web/tsconfig.jest.json` (separate tsconfig for Jest — required because Vite uses `"module": "ESNext"` and `"jsx": "preserve"` which are incompatible with ts-jest). Switched `apps/web` Jest to `testEnvironment: "jsdom"`. Created five new spec files (46 tests):

- `error-message.spec.tsx`
- `error-summary.spec.tsx`
- `submission-confirmation.spec.tsx`
- `field-renderer.spec.tsx` (render-smoke per field type)
- `use-step-guard.spec.ts` (hook state machine: `currentIndex` computation, guard-effect navigation, hidden-step exclusion)

Web statements rose from ~22% to 23.61%.

### Phase 4 — Schema and Edge-Case Coverage
Created:
- `packages/form-types/src/form-step.type.spec.ts` — `formStepSchema`, `recipeFormStepSchema`, `stepConditionalOnBehaviourSchema`.
- `packages/form-types/src/form-field.type.spec.ts` — `primitiveSchema` discriminated union, all 11 `htmlType` variants, common rejections.
- `apps/api/src/forms/form-definitions/form-definitions.controller.spec.ts`
- `apps/api/src/common/response.interceptor.spec.ts`

Extended existing specs with `dateTimeFormatSchema`, `serviceContractRecipeSchema`, and edge-case tests in `form-conditions`, `form-validation` (`date`, `file`, `number` rules).

Fixed `recipeFormStepFieldSchema` from `z.discriminatedUnion` to `z.union` (Zod v4 requires literal discriminators; regex-matched strings are not literals).

---

## 4. Remaining Coverage Gaps

### 4.1 `apps/web` — Largest Absolute Gap

**To 90%:** statements +66.39pp, branches +78.26pp, functions +81.54pp, lines +68.97pp

The web app has 46 unit tests across 6 spec files, plus 6 Playwright E2E specs. The production files that have no unit spec:

| File | Complexity | Unit Test Feasibility | Current Coverage Method |
|---|---|---|---|
| `src/components/file-upload.tsx` | Medium | Achievable — render + interaction under jsdom | E2E (`file-upload.spec.ts`) |
| `src/components/form-error.tsx` | Low | Achievable — simple render | None |
| `src/components/review.tsx` | Medium | Achievable — needs form context mock | E2E (`master-contract.spec.ts`) |
| `src/routes/index.tsx` | Low | Achievable — simple render | None |
| `src/components/form-renderer.tsx` | High | Requires TanStack Query + Router + draft state mocking | E2E (all specs) |
| `src/routes/forms/$formId/index.tsx` | High | Same blockers as `form-renderer` | E2E (all specs) |

Reaching 90% functions requires a decision on `form-renderer` and the route. Phase 3 deliberately excluded them because mocking TanStack Query + React Router + draft state simultaneously produces tests that test the mocks. That trade-off holds for journey-level assertions — but it means the functions metric will remain low unless this scope decision is revisited.

### 4.2 `apps/api` — Branch Coverage Gap

**To 90%:** branches +26.1pp (currently 63.9%)

Branch coverage is notably below statement/line coverage, pointing to conditional paths in files that have some coverage but not all branches exercised.

| Untested File | Key Missing Branches | Risk |
|---|---|---|
| `src/telemetry/metrics.service.ts` | Metric recording conditionals (histogram/counter enabled vs not) | Low — observability only |
| `src/database/base.repository.ts` | Error branches in TypeORM wrapper | Low |
| `src/forms/form-drafts/form-draft.repository.ts` | `findExpired` date logic | Low |
| `src/forms/form-definitions/form-definition.repository.ts` | `findLatest` / `findByVersion` branches | Low |
| `src/forms/submissions/form-submission.repository.ts` | `tx()` rollback path | Medium — transaction safety |

Beyond untested files, existing service specs may not cover all conditional branches. The HTML report at `apps/api/coverage/index.html` is the authoritative source for identifying exact uncovered lines — it must be consulted before writing Phase 5 branch tests.

### 4.3 `packages/form-types` — Statements and Lines Below 90%

**To 90%:** statements +29.85pp, lines +28.22pp

All branches are at 100%. The statements/lines gap reflects that many schema definitions in the package are exercised only partially:

| Remaining Gap | Notes |
|---|---|
| Validation rule schemas (all variants) | These are defined in `form-field.type.ts` and compose into field definitions but are not individually tested |
| `fieldConditionalOnSchema` — `notEqual`, `in`, `exists` operators | Only `equal` tested implicitly through form step schemas |
| `processorSchema` — non-payment processor required field enforcement | Phase 4 tests cover happy paths; rejection paths for non-payment variants not covered |

**Function coverage (6.52%) is a structural artefact** — see §5.3.

### 4.4 `packages/form-conditions` — Branch Gap

**To 90%:** branches +3.21pp (currently 86.79%)

The closest workspace to target. A small set of conditional branches remain unexercised. Likely candidates are edge-case combinations of `evaluateFormConditions` with multiple simultaneous hide/show behaviours or operator variants not covered by existing test cases.

### 4.5 `packages/expressions` — No Coverage Baseline

This package has 25 tests covering `apply-if-rule`, five operations (`age`, `currency`, `days-between`, `register`, `today`), and `resolve-config`. Coverage collection is not configured; current numbers are unknown. It must be brought into the quality gate before Phase 5 can claim full-codebase coverage.

---

## 5. Risks and Mitigation

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Web coverage stagnates — components added without specs, denominator grows | High | High | Enforce `apps/web` threshold ratchet after each Phase 5 sprint; require specs for new components in PR review |
| API branch gap hides untested error-handling paths | High | Medium | Inspect HTML report first; add `MetricsService` + repository specs; tighten branch threshold incrementally |
| `packages/expressions` regresses silently — no floor enforced | Medium | Low | Add coverage config as first task in Phase 5 |
| `form-renderer` E2E-only policy means function coverage ceiling can't reach 90% | Medium | High | Make an explicit recorded decision: accept functions < 90% for `apps/web` with E2E rationale, or bring `form-renderer` into unit scope with full mock stack |
| HTML coverage report never reviewed locally — uncovered branches go unnoticed | Medium | High | CI integration (Phase 5 Phase 4) makes branch coverage visible on every PR |
| `form-validation` branches threshold (85) is below measured actual (90.15%) — threshold needs raising before merge | Medium | Certain | Raise threshold to 88 before merging `testing/coverage` |
| Slow test suite growth discourages running `npm run test:all` locally | Low | Medium | Monitor run times; `npx nx affected --target=test` runs only changed workspaces |
| Form-types function metric creates false impression of low quality | Low | High | Document the structural exemption in `jest.config.ts` and decision records so it is not silently raised without thought |

---

## 6. Measured vs Target Summary

| Workspace | Metric | Measured | Target | Gap | Threshold Set |
|---|---|---|---|---|---|
| `packages/form-conditions` | Statements | 94.93% | 90% | ✓ | 93 |
| | Branches | 86.79% | 90% | −3.21pp | 85 |
| | Functions | 100% | 90% | ✓ | 98 |
| | Lines | 97.26% | 90% | ✓ | 95 |
| `packages/form-validation` | Statements | 94.75% | 90% | ✓ | 90 |
| | Branches | 90.15% | 90% | ✓ | 85 ⚠ raise |
| | Functions | 96% | 90% | ✓ | 90 |
| | Lines | 97.26% | 90% | ✓ | 90 |
| `packages/form-types` | Statements | 60.15% | 90% | −29.85pp | 58 |
| | Branches | 100% | 90% | ✓ | 98 |
| | Functions | 6.52% | exempt* | — | 5 |
| | Lines | 61.78% | 90% | −28.22pp | 59 |
| `apps/api` | Statements | 81.08% | 90% | −8.92pp | 79 |
| | Branches | 63.9% | 90% | −26.1pp | 62 |
| | Functions | 71.74% | 90% | −18.26pp | 70 |
| | Lines | 80.56% | 90% | −9.44pp | 79 |
| `apps/web` | Statements | 23.61% | 90% | −66.39pp | 21 |
| | Branches | 11.74% | 90% | −78.26pp | 10 |
| | Functions | 8.46% | 90%† | −81.54pp | 7 |
| | Lines | 21.03% | 90% | −68.97pp | 19 |

*Functions exemption for `packages/form-types`: the package exports Zod schema objects, not callable functions. This metric does not reflect test quality for this package type.  
†`apps/web` functions target subject to scope decision on `form-renderer` — see §4.1.

---

## 7. Recommendations

### Before merging `testing/coverage`

1. **Raise `form-validation` branches threshold** from 85 to 88 — measured actual is 90.15%; the current threshold is below the previous threshold and understates the regression floor.
2. **Inspect `apps/api` HTML coverage report** — open `apps/api/coverage/index.html` and note the specific uncovered branches. This output should inform Phase 5 task prioritisation rather than guessing from file names.

### Phase 5 (see `docs/superpowers/plans/2026-05-20-testing-phase5.md`)

3. Add `packages/expressions` coverage config — zero effort, closes a blind spot.
4. Push `apps/web` with specs for `file-upload`, `form-error`, `review`, `routes/index`.
5. Push `apps/api` branch coverage with `MetricsService`, repository specs, and targeted branch additions identified from the HTML report.
6. Increase `packages/form-types` statements/lines to 90% by adding validation rule schema tests.
7. Raise `packages/form-conditions` branches from 86.79% to 90% — small number of edge-case tests needed.

### Medium term

8. **CI coverage integration** — upload `lcov.info` on every CI run; PR-level delta comment; trend dashboard.
9. **Enforce threshold ratchet** — after each session that improves coverage, raise thresholds to match actuals. Record the ratchet event in the decision log.
10. **Decide on `form-renderer` scope** — an explicit decision record should document whether `form-renderer` and the route stay E2E-only permanently, or whether unit tests are added in a future phase.

---

*Generated by Claude (claude-sonnet-4-6) on 2026-05-20. Reflects measured coverage after all Phase 1–4 commits on branch `testing/coverage`.  
Prior analysis (pre-implementation estimates): `docs/testing/2026-05-19-coverage-analysis.md`.*
