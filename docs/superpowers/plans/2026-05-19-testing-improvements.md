# Testing Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish measurable coverage baselines across all workspaces, close the highest-risk untested paths in the API, add scoped React unit tests for hooks and leaf components in the web app, and broaden schema coverage in `form-types`.

**Reference:** `docs/testing/2026-05-19-coverage-analysis.md` — full gap analysis this plan is derived from.

**Tech Stack:** TypeScript, Jest + `ts-jest`, Playwright, NestJS `Test.createTestingModule`, React Testing Library + `jsdom`, `jest-axe`, Zod, Nx monorepo.

---

## Approach

Four sequential phases, each independently shippable:

1. **Coverage tooling** — wire up `collectCoverage` so every Jest run produces real numbers instead of estimates.
2. **API gaps** — unit and controller specs for the highest-risk untested paths.
3. **Web unit tests (scoped)** — add `jsdom` + React Testing Library for hooks and leaf/presentation components only; complex stateful components (`form-renderer`, route) stay E2E-only.
4. **Schema and edge-case coverage** — `form-types` Zod schemas and boundary cases in already-tested packages.

**Alternatives considered:**
- *Full React component unit test coverage* — rejected. `form-renderer` and the route require mocking TanStack Query, React Router, and draft state simultaneously; the Playwright suite already provides reliable behaviour coverage for those. Mocking that stack produces tests that test the mocks.
- *Vitest instead of Jest for web* — rejected. Jest is already installed and configured; switching mid-project adds churn for no test-quality gain.

---

## Phase 1 — Coverage Tooling

**Estimated effort:** ~1 day  
**Goal:** Every `npm test` run in every workspace outputs real branch/line/statement numbers and fails if they drop below a minimum threshold.

### Tasks

- [ ] **`apps/api/jest.config.ts`** — add coverage config:
  ```typescript
  collectCoverage: true,
  collectCoverageFrom: [
    "**/*.ts",
    "!**/*.spec.ts",
    "!**/*.module.ts",
    "!**/migrations/**",
    "!**/entities/**",
    "!**/dto/**",
    "!**/main.ts",
    "!**/tracing.ts",
  ],
  coverageReporters: ["text-summary", "lcov", "html"],
  coverageThreshold: {
    global: { branches: 70, functions: 75, lines: 75, statements: 75 },
  },
  ```

- [ ] **`apps/web/jest.config.ts`** — add the same coverage block, scoped to `src/**/*.ts` (exclude `.tsx` until Phase 3 jsdom switch):
  ```typescript
  collectCoverageFrom: [
    "**/*.ts",
    "!**/*.spec.ts",
    "!**/*.d.ts",
  ],
  coverageThreshold: {
    global: { branches: 50, functions: 60, lines: 60, statements: 60 },
  },
  ```

- [ ] **`packages/form-conditions/jest.config.ts`**, **`packages/form-validation/jest.config.ts`**, **`packages/form-types/jest.config.ts`** — add coverage block with thresholds matching estimated current coverage (90 / 90 / 50 respectively) so they enforce but don't immediately break.

- [ ] **`packages/form-conditions/package.json`**, **`packages/form-validation/package.json`**, **`packages/form-types/package.json`** — add `"test": "jest --config jest.config.ts"` script to each.

- [ ] **Root `package.json`** — add `"test:all": "nx run-many --target=test --all"` (or equivalent workspace command) so a single command runs every Jest suite.

### Verify

- `npm run test:all` from the root runs all five Jest suites and each prints a coverage summary table.
- Dropping a covered function produces a threshold failure in the correct workspace.

---

## Phase 2 — High-Priority API Gaps

**Estimated effort:** ~3 days  
**Goal:** Cover the four untested paths that carry the highest production risk.

### 2.1 `GlobalExceptionFilter`

**File to create:** `apps/api/src/common/exception.filter.spec.ts`

- [ ] `HttpException` (400) → response body has correct `statusCode` + `message` shape
- [ ] `HttpException` (404) → response body correct
- [ ] Generic `Error` (non-HTTP) → response is 500
- [ ] 400 response → calls `metricsService.recordValidationFailure`
- [ ] Any HTTP error → calls `metricsService.recordHttpError`
- [ ] Active OpenTelemetry span → `span.setStatus` and `span.recordException` called
- [ ] No active span → no crash (span is `undefined`)

Use a minimal NestJS `Test.createTestingModule` with a mock `MetricsService` and a mock OpenTelemetry tracer. Drive the filter by calling `filter.catch(exception, mockArgumentsHost)` directly — no HTTP server needed.

### 2.2 `FormDraftsController`

**File to create:** `apps/api/src/forms/form-drafts/form-drafts.controller.spec.ts`

- [ ] `POST /` → calls `service.create`, returns `201` with `ApiResponse.success` shape
- [ ] `GET /:draftId` → calls `service.findById`, returns `200`
- [ ] `PATCH /:draftId` → calls `service.update`, returns `200`
- [ ] `DELETE /:draftId` → calls `service.abandon`, returns `204`
- [ ] `service.findById` throws `NotFoundException` → propagates as `404` through filter

Use `Test.createTestingModule` with a mocked `FormDraftsService` (all methods `jest.fn()`). Use `@nestjs/testing` `request` supertest helper or call controller methods directly.

### 2.3 `SubmissionPipelineService.pinVersion` — missing `draftId` path

**File to modify:** `apps/api/src/forms/submissions/submission-pipeline.service.spec.ts`

- [ ] Add test: `dto.draftId` is `undefined` → calls `formDefinitionsService.findByFormId(formId)` directly, returns `{ draft: null, contract }`

### 2.4 `payment-reference.ts`

**File to create:** `apps/api/src/payments/payment-reference.spec.ts`

- [ ] Generated reference is a non-empty string
- [ ] Generated reference matches the expected format/length defined by EzPay requirements
- [ ] Two calls with distinct inputs produce distinct references
- [ ] Determinism test if the function accepts fixed inputs (same inputs → same output)

### Verify

- All four new/updated spec files pass with `npx nx run api:test`.
- Coverage threshold for `apps/api` rises and holds at the Phase 1 baseline.

---

## Phase 3 — Scoped Web Unit Tests

**Estimated effort:** ~2 days  
**Goal:** Add `jsdom` + React Testing Library for hooks and leaf/presentation components only. Complex stateful components (`form-renderer`, route) remain E2E-only.

### Tasks

#### 3.1 — Install dependencies

- [ ] Add to `apps/web` devDependencies:
  ```
  @testing-library/react
  @testing-library/user-event
  @testing-library/jest-dom
  jest-axe
  @types/jest-axe
  ```

#### 3.2 — Update `apps/web/jest.config.ts`

- [ ] Switch `testEnvironment` from `"node"` to `"jsdom"`
- [ ] Add `setupFilesAfterFramework: ["<rootDir>/test/setup.ts"]`
- [ ] Extend `testRegex` to `".*\\.spec\\.tsx?$"` (allow `.tsx` specs)
- [ ] Update `collectCoverageFrom` to include `**/*.tsx`

#### 3.3 — Create `apps/web/src/test/setup.ts`

- [ ] Import `@testing-library/jest-dom` (extends `expect` matchers)
- [ ] Import `jest-axe/extend-expect`

#### 3.4 — `use-step-guard` hook spec

**File to create:** `apps/web/src/hooks/use-step-guard.spec.ts`

- [ ] Returns `true` (accessible) for the first step when no steps are complete
- [ ] Returns `true` for a step when all prior steps are complete
- [ ] Returns `false` (blocked) for a step when a prior step is incomplete
- [ ] Hidden steps (via `activeStepIds`) are not counted as required prerequisites
- [ ] Re-evaluates when `activeStepIds` or `completedStepIds` change

Use `renderHook` from React Testing Library; mock the form context/store with the minimum shape needed.

#### 3.5 — `error-summary` component spec

**File to create:** `apps/web/src/components/error-summary.spec.tsx`

- [ ] Renders nothing when `errors` is empty
- [ ] Renders a list item per error when `errors` is non-empty
- [ ] Each list item contains the error message text
- [ ] Links in the summary navigate to the correct field anchor
- [ ] Passes `jest-axe` accessibility audit

#### 3.6 — `error-message` component spec

**File to create:** `apps/web/src/components/error-message.spec.tsx`

- [ ] Renders the message string
- [ ] Applies the correct Gov Design System error class
- [ ] Renders nothing / null when no message is passed
- [ ] Passes `jest-axe` accessibility audit

#### 3.7 — `submission-confirmation` component spec

**File to create:** `apps/web/src/components/submission-confirmation.spec.tsx`

- [ ] Renders reference number when provided
- [ ] Renders contact details panel when `contactDetails` is present
- [ ] Does not render contact panel when `contactDetails` is absent
- [ ] Passes `jest-axe` accessibility audit

#### 3.8 — `field-renderer` dispatch spec

**File to create:** `apps/web/src/components/field-renderer.spec.tsx`

- [ ] Schema type `"text"` → renders a text input
- [ ] Schema type `"textarea"` → renders a textarea
- [ ] Schema type `"radio"` → renders radio buttons
- [ ] Schema type `"checkbox"` → renders checkboxes
- [ ] Schema type `"select"` → renders a select element
- [ ] Schema type `"file"` → renders a file input
- [ ] Schema type `"date"` → renders date input(s)
- [ ] Unknown/unsupported type → renders nothing, does not throw

Keep these as render-smoke tests (does the right element appear), not full interaction tests — those are owned by the Playwright validation spec.

### Verify

- `npx nx run web:test` runs all Jest specs (existing `form-query.spec.ts` + new specs) under jsdom.
- `form-query.spec.ts` continues to pass unchanged (pure logic, unaffected by env switch).
- No Playwright spec is removed or modified as a result of this phase.

---

## Phase 4 — Schema and Edge-Case Coverage

**Estimated effort:** ~2 days  
**Goal:** Raise `form-types` coverage and close known edge-case gaps in already-tested packages.

### 4.1 — `form-types` schema coverage

**File to create:** `packages/form-types/src/form-step.type.spec.ts`

- [ ] `formStepSchema` — valid step with required fields passes
- [ ] `formStepSchema` — missing `stepId` fails
- [ ] `formStepSchema` — missing `title` fails
- [ ] `recipeFormStepSchema` — valid repeatable step passes
- [ ] `stepConditionalOnSchema` — valid condition passes; missing `operator` fails

**File to create:** `packages/form-types/src/form-field.type.spec.ts`

- [ ] Each field type variant (`text`, `textarea`, `radio`, `checkbox`, `select`, `file`, `date`) passes with required fields
- [ ] Missing `fieldId` fails on all variants
- [ ] Discriminated union narrows correctly (wrong `type` string for a variant fails)

**File to modify:** `packages/form-types/src/service-contract.type.spec.ts`

- [ ] `serviceContractRecipeSchema` — valid recipe contract passes
- [ ] `serviceContractRecipeSchema` — uses `recipeFormStepSchema` steps (plain `formStepSchema` step rejected if schemas diverge)
- [ ] `dateTimeFormatSchema` — accepts ISO 8601 without milliseconds (`"2026-01-01T00:00:00Z"`)
- [ ] `dateTimeFormatSchema` — accepts non-UTC offset (`"2026-01-01T00:00:00+05:30"`)
- [ ] `dateTimeFormatSchema` — rejects a plain date string (`"2026-01-01"`)
- [ ] `dateTimeFormatSchema` — rejects free text

### 4.2 — Edge cases in `packages/form-conditions`

**File to modify:** `packages/form-conditions/src/index.spec.ts`

- [ ] `evaluateFormConditions` — empty `steps` array → returns empty active/hidden sets without throwing
- [ ] `evaluateCondition` — unknown operator string (cast via `as any`) → returns `false`, does not throw

### 4.3 — Edge cases in `packages/form-validation`

**File to modify:** `packages/form-validation/src/index.spec.ts`

- [ ] `validate()` — unknown rule key in `validations` object → treated as no-op, field is valid

**File to modify:** `packages/form-validation/src/rules/date.spec.ts`

- [ ] `afterRunner` — `referenceFieldId` resolves to a non-date string → returns an error (does not throw)

**File to modify:** `packages/form-validation/src/rules/file.spec.ts`

- [ ] `fileTypesRunner` — batch where first file passes but second file fails → returns error for the failing file

**File to modify:** `packages/form-validation/src/rules/number.spec.ts`

- [ ] `gtRunner` — referenced field value is a non-numeric string → returns an error (does not throw)

### 4.4 — Remaining API untested files

**Files to create:**

- [ ] `apps/api/src/forms/form-definitions/form-definitions.controller.spec.ts` — `GET /:formId` and `GET /:formId/:version` endpoint tests (same pattern as Phase 2.2)
- [ ] `apps/api/src/common/response.interceptor.spec.ts` — intercept call injects `status: "success"` into response body
- [ ] `apps/api/src/payments/payment-reference.spec.ts` — (if not already done in Phase 2)

### Verify

- `npx nx run form-types:test` passes with coverage at or above the Phase 1 threshold.
- `npx nx run form-conditions:test` and `npx nx run form-validation:test` pass with no regressions.
- `npx nx run api:test` passes; coverage does not drop from Phase 2 baseline.

---

## File Map

| File | Change |
|---|---|
| `apps/api/jest.config.ts` | Add coverage config + thresholds |
| `apps/web/jest.config.ts` | Add coverage config; switch to `jsdom`; extend testRegex for `.tsx` |
| `packages/form-conditions/jest.config.ts` | Add coverage config + thresholds |
| `packages/form-validation/jest.config.ts` | Add coverage config + thresholds |
| `packages/form-types/jest.config.ts` | Add coverage config + thresholds |
| `packages/form-conditions/package.json` | Add `"test"` script |
| `packages/form-validation/package.json` | Add `"test"` script |
| `packages/form-types/package.json` | Add `"test"` script |
| Root `package.json` | Add `"test:all"` script |
| `apps/web/src/test/setup.ts` | New — jest-dom + jest-axe extends |
| `apps/api/src/common/exception.filter.spec.ts` | New |
| `apps/api/src/forms/form-drafts/form-drafts.controller.spec.ts` | New |
| `apps/api/src/forms/form-definitions/form-definitions.controller.spec.ts` | New |
| `apps/api/src/common/response.interceptor.spec.ts` | New |
| `apps/api/src/payments/payment-reference.spec.ts` | New |
| `apps/api/src/forms/submissions/submission-pipeline.service.spec.ts` | Add `pinVersion` no-draftId test |
| `apps/web/src/hooks/use-step-guard.spec.ts` | New |
| `apps/web/src/components/error-summary.spec.tsx` | New |
| `apps/web/src/components/error-message.spec.tsx` | New |
| `apps/web/src/components/submission-confirmation.spec.tsx` | New |
| `apps/web/src/components/field-renderer.spec.tsx` | New |
| `packages/form-types/src/form-step.type.spec.ts` | New |
| `packages/form-types/src/form-field.type.spec.ts` | New |
| `packages/form-types/src/service-contract.type.spec.ts` | Add `recipeSchema` + `dateTimeFormat` tests |
| `packages/form-conditions/src/index.spec.ts` | Add empty steps + unknown operator tests |
| `packages/form-validation/src/index.spec.ts` | Add unknown rule key test |
| `packages/form-validation/src/rules/date.spec.ts` | Add non-date reference test |
| `packages/form-validation/src/rules/file.spec.ts` | Add mixed-batch test |
| `packages/form-validation/src/rules/number.spec.ts` | Add non-numeric reference test |

---

## Open Questions

- **`use-step-guard` internals** — the spec tasks assume the hook accepts `activeStepIds` and `completedStepIds` as inputs. Confirm the actual hook signature before writing the spec; adjust task 3.4 accordingly.
- **`payment-reference.ts`** — the current code has not been read. The spec tasks assume it is a deterministic pure function. If it wraps a UUID generator or timestamp, the determinism test needs a mock; read the source before implementing Phase 2.4.
- **Coverage thresholds** — the Phase 1 thresholds (70/75/75/75 for `apps/api`, 50/60/60/60 for `apps/web`) are conservative starting points. After Phase 1 runs produce real numbers, tighten them to match actuals before merging.
- **`testEnvironment` switch impact** — switching `apps/web` Jest from `"node"` to `"jsdom"` in Phase 3 may affect the existing `form-query.spec.ts` (TanStack Query + `QueryClient`). Verify it still passes under jsdom before adding the new component specs.
