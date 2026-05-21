# Testing Phase 5 — Path to 90% Coverage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach 90% statement, branch, function, and line coverage across all workspaces — closing the gaps left after Phases 1–4 and enforcing a threshold ratchet so coverage cannot quietly decay.

**Reference:** `docs/testing/2026-05-20-coverage-evaluation.md` — full gap analysis this plan is derived from.  
**Prior plan:** `docs/superpowers/plans/2026-05-19-testing-improvements.md` (Phases 1–4, all complete).

**Tech Stack:** TypeScript, Jest + `ts-jest`, Playwright, NestJS `Test.createTestingModule`, React Testing Library + `jsdom`, `jest-axe`, Zod, Nx monorepo.

**Coverage target:** 90% statements, branches, functions, and lines across all workspaces.  
**Exemptions:**
- `packages/form-types` functions — structural exemption; package exports Zod schema objects, not callable functions. Target 90% on statements, branches, and lines only.
- `apps/web` functions — subject to scope decision on `form-renderer` (see Phase 3 open questions). Target 90% on statements, branches, and lines. Functions target will be set after Phase 3 measurements.

---

## Approach

Four sequential phases, each independently shippable:

1. **Tooling cleanup** — bring `packages/expressions` into the quality gate, document exemptions, raise the one under-set threshold (`form-validation` branches).
2. **API branch coverage** — inspect the HTML coverage report to find exact uncovered branches, then add `MetricsService` and repository specs.
3. **Web component coverage push** — add unit specs for `file-upload`, `form-error`, `review`, and `routes/index`; reassess scope on `form-renderer` after measuring the gain.
4. **Schema coverage push** — bring `packages/form-types` statements/lines to 90% and close the `form-conditions` branch gap.

**Alternatives considered:**
- *Playwright coverage instrumentation (v8/Istanbul for TypeScript)* — would lift `apps/web` numbers without additional unit tests. Deferred: requires non-trivial build tooling changes, adds CI flakiness risk, and blurs the unit/E2E boundary. Revisit if Phase 3 hits a ceiling on `form-renderer`.
- *Unit tests for `form-renderer` and the main form route* — these require mocking TanStack Query, React Router, and draft state simultaneously. The Playwright suite provides reliable journey coverage for those components. Mocking that stack produces tests that test the mocks, not the component. This plan keeps them E2E-only unless Phase 3 measurements reveal functions cannot reach 90% without them.

---

## Phase 1 — Tooling Cleanup

**Estimated effort:** ~0.5 days  
**Goal:** Every workspace is inside the quality gate; the one under-set threshold is corrected; exemptions are documented.

### Tasks

- [ ] **`packages/expressions/jest.config.ts`** — add coverage block:
  ```typescript
  collectCoverage: true,
  collectCoverageFrom: ["**/*.ts", "!**/*.spec.ts", "!**/*.d.ts"],
  coverageReporters: ["text-summary", "lcov", "html"],
  coverageThreshold: {
    global: { branches: 0, functions: 0, lines: 0, statements: 0 },
  },
  ```
  Run `npx nx run expressions:test` to get real numbers, then set each threshold ~2 points below actuals per the ratchet policy. Update with real values before committing.

- [ ] **`packages/expressions/package.json`** — confirm `"test": "jest --config jest.config.ts"` is present (add if missing, matching the other packages).

- [ ] **`packages/form-validation/jest.config.ts`** — raise branches threshold from 85 to 88 (measured actual is 90.15%; current threshold understates the regression floor):
  ```typescript
  coverageThreshold: {
    global: { branches: 88, functions: 94, lines: 95, statements: 93 },
  },
  ```

- [ ] **`packages/form-types/jest.config.ts`** — add a comment above the functions threshold documenting the structural exemption:
  ```typescript
  coverageThreshold: {
    global: {
      branches: 98,
      // functions exemption: this package exports Zod schema objects, not callable
      // functions. 6.52% is the structural floor. Do not raise without adding
      // runtime utility functions to the package intentionally.
      functions: 5,
      lines: 59,
      statements: 58,
    },
  },
  ```

- [ ] **`docs/decisions/`** — create `0003-90pct-coverage-target-and-exemptions.md` documenting:
  - Project target: 90% statements, branches, functions, lines.
  - `packages/form-types` functions exemption and the reason.
  - `apps/web` functions target deferred to post-Phase 3 measurement.
  - Threshold ratchet policy: thresholds are raised after each session that improves coverage, never set to a future target upfront.

### Verify

- `npm run test:all` passes with the updated thresholds.
- `packages/expressions` appears in `test:all` output with a coverage summary table.
- `packages/form-validation` does not fail on branches (threshold 88 vs actual 90.15% — passes).
- `packages/form-types` does not fail on functions (threshold 5 vs actual 6.52% — passes).

---

## Phase 2 — API Branch Coverage

**Estimated effort:** ~2 days  
**Goal:** Push `apps/api` from 63.9% branches to ≥90%.

**Required first step:** Run `npx nx run api:test` and open `apps/api/coverage/index.html`. Identify every file where branch coverage is below 90% and note the specific uncovered lines. Write tests against those findings — do not write tests against guesses.

### 2.1 — `MetricsService`

**File to create:** `apps/api/src/telemetry/metrics.service.spec.ts`

- [ ] `recordHttpError` — histogram `observe` called with correct status-code label
- [ ] `recordValidationFailure` — counter `add` called once
- [ ] `recordProcessingDuration` — histogram `observe` called with correct value
- [ ] Service initialises when OpenTelemetry is not configured — no throw (graceful degradation branch)
- [ ] Conditional metric-enabled branch (if metrics can be toggled) — both enabled and disabled paths covered

Use `jest.mock` at the module boundary to replace the OpenTelemetry metrics SDK. Avoid injecting a mock meter into the constructor if the SDK is accessed as a module-level singleton.

### 2.2 — Repository Specs

Thin TypeORM wrappers — small effort, targeted at uncovered branches only. Each spec should use `jest.fn()` to mock the TypeORM `DataSource` / `Repository`.

- [ ] **`apps/api/src/database/base.repository.spec.ts`**
  - `findById` — found (returns entity), not found (returns null or throws)
  - `save` — delegates to TypeORM `save`
  - `delete` — delegates to TypeORM `delete`

- [ ] **`apps/api/src/forms/form-drafts/form-draft.repository.spec.ts`**
  - `findByDraftId` — found, not found
  - `findExpired` — returns drafts older than cutoff; empty result

- [ ] **`apps/api/src/forms/form-definitions/form-definition.repository.spec.ts`**
  - `findLatest` — returns latest version
  - `findByVersion` — returns specific version, not found

- [ ] **`apps/api/src/forms/submissions/form-submission.repository.spec.ts`**
  - `tx()` helper — success path (commits); error path (rolls back, re-throws original error)

### 2.3 — Targeted branch tests from HTML report

After inspecting `apps/api/coverage/index.html`, add tests for any uncovered conditional branches identified. Candidates that are likely to surface based on prior analysis:

- [ ] `SubmissionsService` — any remaining status-check branches not yet covered (check HTML report; do not assume)
- [ ] `SubmissionPipelineService.validateActiveFields` — N>2 failing steps (loop iteration beyond first failure)
- [ ] `SpreadsheetProcessor` — N>2 rows in duplicate scan (verify from HTML report — may already be covered)
- [ ] `RegistryService.hydrateForm` — step with zero elements

### 2.4 — Threshold ratchet

- [ ] After all Phase 2 tests pass, run `npx nx run api:test` and record the new coverage numbers.
- [ ] Update `apps/api/jest.config.ts` thresholds to sit ~2 points below each measured metric.
- [ ] Target: branches ≥88 (2 points below the 90% target).

### Verify

- `npx nx run api:test` passes with branch coverage ≥88.
- All new spec files pass individually (`npx nx run api:test -- --testPathPattern=metrics`).
- HTML report shows no red (0%) files that were previously unexercised.

---

## Phase 3 — Web Component Coverage Push

**Estimated effort:** ~3 days  
**Goal:** Push `apps/web` statements/lines/branches toward 90%. Establish a functions measurement after new specs are added to inform the scope decision on `form-renderer`.

### 3.1 — `form-error` component

**File to create:** `apps/web/src/components/form-error.spec.tsx`

- [ ] Renders the error message string when provided
- [ ] Renders nothing (null or empty) when `error` prop is absent
- [ ] Applies the correct Gov Design System error class to the wrapper element
- [ ] Passes `jest-axe` accessibility audit

### 3.2 — `routes/index` route

**File to create:** `apps/web/src/routes/index.spec.tsx`

- [ ] Renders without crashing
- [ ] Contains the expected heading or landmark element
- [ ] Passes `jest-axe` accessibility audit

Wrap in a minimal `MemoryRouter` or stub TanStack Router context if the route reads router state; otherwise render directly.

### 3.3 — `file-upload` component

**File to create:** `apps/web/src/components/file-upload.spec.tsx`

- [ ] Renders a file input with the correct `accept` attribute (derived from `fileTypes` field config)
- [ ] Selecting a valid file adds it to the displayed file list
- [ ] Selecting a file whose MIME type is not in `fileTypes` shows the correct error message
- [ ] Selecting a file exceeding `itemMaxSize` shows the correct error message
- [ ] Remove button removes the file from the displayed list
- [ ] When the number of files equals `maxItems`, the add/select control is hidden or disabled
- [ ] When fewer files than `minItems` are selected and the field is validated, the error is shown
- [ ] Passes `jest-axe` accessibility audit

Use `userEvent.upload` from `@testing-library/user-event` to simulate file selection. Mock `File` with a realistic `type` and `size` property.

### 3.4 — `review` component

**File to create:** `apps/web/src/components/review.spec.tsx`

- [ ] Renders one section per active (non-hidden) step
- [ ] Renders a label and value row per visible field within each section
- [ ] Fields in `hiddenFieldIds` are not rendered
- [ ] Steps in `hiddenStepIds` are not rendered
- [ ] A section where all fields are hidden does not render
- [ ] Radio and checkbox fields display the option label, not the raw value
- [ ] A "Change" link is present for each section and navigates to the correct step path
- [ ] Passes `jest-axe` accessibility audit

Provide a minimal mock: `activeStepIds`, `hiddenStepIds`, `hiddenFieldIds`, `stepValues`, and a `contract` with step/field definitions. No TanStack Query needed if the review component receives these as props or reads from a React context that can be provided via a wrapper.

Read `apps/web/src/components/review.tsx` before writing the spec to confirm the prop/context shape.

### 3.5 — Scope decision checkpoint

- [ ] After §3.1–3.4 are passing, run `npx nx run web:test` and record the new coverage numbers.
- [ ] If **functions ≥ 88%**: set threshold to measured value −2 points; Phase 3 is complete.
- [ ] If **functions < 88%**: identify the top-5 uncovered functions (from the HTML report). For each, decide:
  - Is it reachable with an additional unit test? → add the test.
  - Is it in `form-renderer.tsx` or `routes/forms/$formId/index.tsx`? → escalate to the scope decision below.
- [ ] **Scope decision for `form-renderer`**: create a task item here only if the measurement shows functions < 88% and the gap is attributable to `form-renderer`. Document the decision (add unit tests vs accept E2E-only) in `docs/decisions/0003-*`.

### 3.6 — Threshold ratchet

- [ ] Update `apps/web/jest.config.ts` thresholds to sit ~2 points below each newly measured metric.

### Verify

- `npx nx run web:test` passes (all existing specs + 4 new specs).
- No Playwright spec is removed or modified as a result of this phase.
- `form-query.spec.ts` continues to pass unchanged under jsdom.
- Statements ≥ threshold; branches ≥ threshold; lines ≥ threshold.

---

## Phase 4 — Schema Coverage Push

**Estimated effort:** ~1.5 days  
**Goal:** Bring `packages/form-types` statements/lines to 90% and push `packages/form-conditions` branches past 90%.

### 4.1 — `form-types` validation rule schemas

**File to create:** `packages/form-types/src/validation-rules.type.spec.ts`

The validation rule schemas are defined alongside field definitions and are composed into field configurations. They have not been individually tested.

- [ ] `requiredRuleSchema` — valid rule passes; missing `value` fails; custom `error` string accepted
- [ ] `minLengthRuleSchema` / `maxLengthRuleSchema` — valid passes; non-number `value` fails
- [ ] `patternRuleSchema` — valid regex string passes; missing `pattern` fails
- [ ] `emailRuleSchema` — valid passes (no extra fields required)
- [ ] `minItemsRuleSchema` / `maxItemsRuleSchema` — valid passes; non-number `value` fails
- [ ] `minRuleSchema` / `maxRuleSchema` / `gtRuleSchema` / `ltRuleSchema` — valid passes; non-number value fails; `referenceFieldId` accepted; `targetStepId` accepted
- [ ] `fileTypesRuleSchema` — valid array of MIME strings passes; non-array fails
- [ ] `itemMaxSizeRuleSchema` / `maxSizeRuleSchema` — valid number passes; non-number fails
- [ ] `afterRuleSchema` / `beforeRuleSchema` — valid date string passes; `referenceFieldId` + `targetStepId` accepted
- [ ] `conditionalOnRuleSchema` — valid passes

Read `packages/form-types/src/` to confirm the exact schema names before writing — do not assume names from this plan.

### 4.2 — `form-types` field conditional schema

**File to modify:** `packages/form-types/src/form-field.type.spec.ts`

- [ ] `fieldConditionalOnSchema` — `notEqual` operator passes
- [ ] `fieldConditionalOnSchema` — `in` operator passes
- [ ] `fieldConditionalOnSchema` — `exists` operator passes
- [ ] `fieldConditionalOnSchema` — missing `operator` fails

### 4.3 — `form-types` threshold ratchet

- [ ] Run `npx nx run form-types:test` after §4.1–4.2 pass and record the new statements/lines numbers.
- [ ] Update `packages/form-types/jest.config.ts` statements and lines thresholds to sit ~2 points below actuals. Target: statements ≥88, lines ≥88.

### 4.4 — `form-conditions` branch gap

**File to modify:** `packages/form-conditions/src/index.spec.ts`

Inspect `packages/form-conditions/coverage/index.html` to identify the specific uncovered branch lines before writing.

- [ ] From the HTML report, add 2–3 targeted tests covering the identified uncovered branch(es). Likely candidates based on prior analysis:
  - `evaluateFormConditions` — a step with both show and hide behaviours simultaneously (multiple behaviours on one element)
  - `evaluateCondition` — `in` operator with a `targetStepId` that exists but contains no matching fieldId
  - Any other branches identified in the report

- [ ] Update `packages/form-conditions/jest.config.ts` branches threshold from 85 to 88 after branches reach ≥90%.

### Verify

- `npx nx run form-types:test` passes with statements ≥88 and lines ≥88.
- `npx nx run form-conditions:test` passes with branches ≥88.
- `npm run test:all` passes across all workspaces.

---

## File Map

| File | Change |
|---|---|
| `packages/expressions/jest.config.ts` | Add coverage config + thresholds (set from real measurements) |
| `packages/expressions/package.json` | Confirm or add `"test"` script |
| `packages/form-validation/jest.config.ts` | Raise branches threshold from 85 → 88 |
| `packages/form-types/jest.config.ts` | Add exemption comment to functions threshold |
| `packages/form-conditions/jest.config.ts` | Raise branches threshold from 85 → 88 after Phase 4.4 |
| `apps/api/jest.config.ts` | Ratchet all thresholds up after Phase 2 |
| `apps/web/jest.config.ts` | Ratchet all thresholds up after Phase 3 |
| `apps/api/src/telemetry/metrics.service.spec.ts` | New |
| `apps/api/src/database/base.repository.spec.ts` | New |
| `apps/api/src/forms/form-drafts/form-draft.repository.spec.ts` | New |
| `apps/api/src/forms/form-definitions/form-definition.repository.spec.ts` | New |
| `apps/api/src/forms/submissions/form-submission.repository.spec.ts` | New |
| `apps/web/src/components/form-error.spec.tsx` | New |
| `apps/web/src/routes/index.spec.tsx` | New |
| `apps/web/src/components/file-upload.spec.tsx` | New |
| `apps/web/src/components/review.spec.tsx` | New |
| `packages/form-types/src/validation-rules.type.spec.ts` | New |
| `packages/form-types/src/form-field.type.spec.ts` | Add `fieldConditionalOnSchema` operator tests |
| `packages/form-conditions/src/index.spec.ts` | Add targeted branch tests from HTML report |
| `docs/decisions/0003-*.md` | New — 90% target, exemptions, ratchet policy |

---

## Open Questions

- **`packages/expressions` actual coverage** — unknown until `npx nx run expressions:test` runs with `collectCoverage: true`. If coverage is low, Phase 4 may need a `packages/expressions` task added.
- **`apps/web` functions ceiling** — after Phase 3 measurements, if functions remain below 88% and the gap is attributable to `form-renderer` or the main route, a scope decision is required: bring those components into unit test scope (significant mock complexity) or accept a permanent exemption (document in `docs/decisions/`).
- **`form-builder` API module** — currently excluded from `apps/api` `collectCoverageFrom`. When the follow-up task for this module lands, add it to collection and account for the denominator growth in the next threshold ratchet.
