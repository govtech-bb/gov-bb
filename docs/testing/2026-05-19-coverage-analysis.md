# Test Coverage Analysis — Modular Forms Monorepo

**Date:** 2026-05-19 (updated after merges from `dev` and `frontend/staging`)  
**Analyst:** Claude (AI-assisted review)  
**Branch:** `testing/coverage`  
**Scope:** Full codebase — packages, API, and web app

---

## 1. Executive Summary

The repository has a solid testing foundation for its business logic layer. All shared packages (`form-conditions`, `form-validation`) and the API service layer are well-tested with meaningful unit and integration tests. Since the initial analysis, three significant feature merges have substantially raised the floor:

- **PR #168 (Playwright E2E)** — added a full E2E test suite for `apps/forms` covering navigation, conditionals, validation, repeatable steps, and file uploads
- **PR #171 (TanStack Query + Jest for web)** — added Jest config and a unit spec for the form caching layer
- **PR #174 (MDA contact details + email module tests)** — added schema tests for `form-types` and a comprehensive test suite for the new email body builder and template service

No coverage reporting tool is currently configured in any package, so numeric coverage percentages remain estimated from code inspection.

| Workspace | Est. Coverage | Status |
|---|---|---|
| `packages/form-conditions` | ~90% | Good |
| `packages/form-validation` | ~90% | Good |
| `packages/form-types` | ~50% | Improved |
| `apps/api` (service layer) | ~80% | Good |
| `apps/api` (controller/infra layer) | ~15% | Needs work |
| `apps/api` (email module) | ~85% | Good |
| `apps/forms` (Playwright E2E) | ~55% | Partially addressed |
| `apps/forms` (Jest unit) | ~5% | Needs work |

**Total test files found:** 37 (31 Jest `.spec.ts` + 6 Playwright `.spec.ts`)  
**Test frameworks:** Jest with `ts-jest` preset; Playwright for E2E  
**Test naming convention:** `.spec.ts` (consistent throughout)

---

## 2. Test Infrastructure Audit

### 2.1 What Is Configured

| Package | Jest Config | Playwright Config | Test Script | Coverage Config |
|---|---|---|---|---|
| `apps/api` | `jest.config.ts` ✓ | — | `"test": "jest --config jest.config.ts"` ✓ | None |
| `apps/forms` | `jest.config.ts` ✓ | `playwright.config.ts` ✓ | None ✗ | None |
| `packages/form-conditions` | `jest.config.ts` ✓ | — | None ✗ | None |
| `packages/form-validation` | `jest.config.ts` ✓ | — | None ✗ | None |
| `packages/form-types` | `jest.config.ts` ✓ | — | None ✗ | None |

**Note on `apps/forms` Jest config:** The newly added `jest.config.ts` sets `testEnvironment: "node"`. This means the Jest suite can test pure TypeScript logic (query factories, utilities, type guards) but **cannot unit-test React components** — that requires `testEnvironment: "jsdom"` with React Testing Library. The E2E layer (Playwright) handles user-facing behaviour coverage.

### 2.2 Missing Infrastructure

- **No coverage collection** — no `collectCoverage: true`, no `collectCoverageFrom`, no `coverageThreshold`, no reporter (lcov, html, text-summary) in any Jest config
- **No package test scripts** — `packages/*` have Jest configs but no `npm test` to run them; they are only discoverable via Nx targets
- **No React component unit tests** — `apps/forms` Jest is `testEnvironment: "node"`; adding React Testing Library requires switching to `jsdom` and configuring a setup file
- **No CI coverage reporting** — no CodeCov, Codecov, or SonarQube integration
- **No API E2E / HTTP-layer tests** — Playwright covers the browser side; no Supertest integration tests exercise the NestJS HTTP layer

---

## 3. Per-Package Coverage Analysis

### 3.1 `packages/form-conditions`

**Source entry point:** `src/index.ts`  
**Spec file:** `src/index.spec.ts` (537 lines)  
**Estimated coverage:** ~90%

#### What Is Tested

| Function/Behaviour | Tested | Notes |
|---|---|---|
| `flattenStepValues` — merges step values | ✓ | Empty input also tested |
| `evaluateCondition` — `equal` operator | ✓ | Match, no match, undefined target |
| `evaluateCondition` — `notEqual` operator | ✓ | Includes undefined-is-not-equal semantics |
| `evaluateCondition` — `in` operator | ✓ | Match, no match, undefined target |
| `evaluateCondition` — `exists` operator | ✓ | Non-empty string, undefined, null, empty string |
| `evaluateCondition` — `targetStepId` scoping | ✓ | Step-scoped lookup, wrong step, missing step, flat fallback |
| `evaluateFormConditions` — no behaviours | ✓ | All steps/fields active |
| `evaluateFormConditions` — step-level hide | ✓ | Condition evaluates false → step hidden, all its fields hidden |
| `evaluateFormConditions` — step-level show | ✓ | Condition evaluates true → step and fields active |
| `evaluateFormConditions` — hidden step overrides field behaviours | ✓ | Fields in a hidden step are always hidden |
| `evaluateFormConditions` — field-level hide | ✓ | Field hidden when condition false |
| `evaluateFormConditions` — field-level show | ✓ | Field active when condition true |
| `evaluateFormConditions` — AND semantics | ✓ | Multiple behaviours: all must pass to show |
| `evaluateFormConditions` — cross-step `targetStepId` | ✓ | Same fieldId in multiple steps resolved correctly |

#### Coverage Gaps

- Unknown/future operator fallthrough — TypeScript discriminated unions mean this is a compile-time guard, but there is no runtime test for an unexpected operator value
- Forms with zero steps (empty contract)
- Behaviour arrays with a mix of step-level and field-level types on the same element

---

### 3.2 `packages/form-validation`

**Spec files:** `src/index.spec.ts` + 6 rule-specific specs  
**Estimated coverage:** ~90%

#### `validate()` Orchestrator Tests (`index.spec.ts`)

| Scenario | Tested |
|---|---|
| No primitives → valid | ✓ |
| No validations → valid | ✓ |
| Fail-all (not fail-fast) — multiple field errors | ✓ |
| Multiple rule errors for single field | ✓ |
| Skip all rules for empty optional field | ✓ |
| `required: { value: false }` treated as optional | ✓ |
| Non-empty optional field runs subsequent rules | ✓ |
| Number `0` is a valid (non-empty) value | ✓ |
| Empty checkbox array treated as empty → skip optional rules | ✓ |
| Checkbox `required` + `minItems` | ✓ |
| Cross-field via flat `allValues` fallback | ✓ |
| Cross-field scoped to `targetStepId` | ✓ |
| Skip cross-field when reference field absent | ✓ |
| Custom error messages | ✓ |
| `conditionalOn` rule explicitly ignored | ✓ |
| Same-step cross-field reference (no `allValues`) | ✓ |
| Same-step cross-field fails correctly | ✓ |
| `allValues` preferred over `stepValues` for reference | ✓ |

#### Rule Runner Tests

| Rule file | Runners tested | Key edge cases |
|---|---|---|
| `required.spec.ts` | `requiredRunner` | 0, `false`, empty array, null, undefined, whitespace, custom error |
| `string.spec.ts` | `minLength`, `maxLength`, `pattern`, `email`, `contains`, `strictEquality` | All include custom error + cross-field + `targetStepId` |
| `number.spec.ts` | `min`, `max`, `gt`, `lt`, `equal`, `notEqual` | Cross-field + `targetStepId` for `gt`, `equal`, `notEqual`; skip-when-missing |
| `date.spec.ts` | `past`, `pastOrToday`, `future`, `futureOrToday`, `after`, `before`, `onOrAfter`, `onOrBefore`, `minYear`, `maxYear` | Today boundary; cross-field + `targetStepId` for `after`; skip-when-missing |
| `array.spec.ts` | `minItems`, `maxItems`, `minSelection`, `maxSelection`, `radio` | Non-array input, config.value not array |
| `file.spec.ts` | `fileTypes`, `itemMaxSize`, `maxSize` | Empty list, mime type match, config undefined |

#### Coverage Gaps

- No test for an unrecognised validation rule key reaching the dispatcher (should be a no-op)
- `date` rules: `afterRunner` with `referenceFieldId` when reference is a non-date string (invalid date comparison)
- `fileTypes`: mixed allowed/disallowed in the same batch (first failing file stops the check)
- `gt`/`lt` with a non-numeric referenced field value

---

### 3.3 `packages/form-types`

**Spec files:** `src/processor.type.spec.ts` + `src/service-contract.type.spec.ts`  
**Estimated coverage:** ~50% (up from ~20%)

#### What Is Tested

**`processor.type.spec.ts` (3 tests):**
- `processorSchema.safeParse` — payment processor with all required fields passes
- `processorSchema.safeParse` — payment processor missing `customerEmailPath` fails
- `processorSchema.safeParse` — email, opencrvs, spreadsheet processor types accepted

**`service-contract.type.spec.ts` (12 tests — new):**

| Test | Covered |
|---|---|
| `contactDetailsSchema` — full valid object (title, telephoneNumber, email, full address) | ✓ |
| `contactDetailsSchema` — without address (address is optional) | ✓ |
| `contactDetailsSchema` — partial address (line2 and country optional) | ✓ |
| `contactDetailsSchema` — rejects missing `title` | ✓ |
| `contactDetailsSchema` — rejects missing `telephoneNumber` | ✓ |
| `contactDetailsSchema` — rejects missing `email` | ✓ |
| `contactDetailsSchema` — rejects invalid email format | ✓ |
| `contactDetailsSchema` — rejects empty string `title` (min(1)) | ✓ |
| `contactDetailsSchema` — rejects empty string `telephoneNumber` (min(1)) | ✓ |
| `serviceContractSchema` — accepts contract without `contactDetails` | ✓ |
| `serviceContractSchema` — accepts contract with valid `contactDetails` | ✓ |
| `serviceContractSchema` — rejects contract with invalid `contactDetails` | ✓ |

#### Coverage Gaps

- All other Zod schemas in the package remain untested: `formStepSchema`, field/element schemas, `fieldConditionalOnSchema`, condition behaviour schemas, all validation rule schemas
- `serviceContractRecipeSchema` (parallel to `serviceContractSchema`) has no spec
- No tests for discriminated union narrowing on the `Processor` type variants
- No tests verifying that required fields on non-payment processors are enforced
- `dateTimeFormatSchema` — the ISO 8601 datetime validator has no dedicated tests (only implicitly exercised via `serviceContractSchema`)

---

### 3.4 `apps/api` — Service Layer

#### `FormDraftsService` — Well Covered

| Method | Scenarios Tested |
|---|---|
| `create` | Pins latest version, pins specified version, returns existing draft (idempotent), with initial values/page, defaults, form not found |
| `findById` | Found, not found (NotFoundException) |
| `update` | Value merge (preserves prior fields), `lastActivePage`, no mutation of original, abandoned draft guard |
| `abandon` | Status transition, not found |
| `cleanupExpired` | Abandoned cutoff, active stale cutoff, cutoff is 7 days past, runs delete twice |

#### `FormDefinitionsService` — Well Covered

| Method | Scenarios Tested |
|---|---|
| `findByFormId` | Latest version (no version arg), specific version, formId not found, formId+version not found |

#### `SubmissionsService` — Well Covered

| Scenario | Tested |
|---|---|
| Missing/whitespace idempotency key | ✓ |
| Create new submission (happy path) | ✓ |
| Emits `submission.created` event | ✓ |
| Duplicate: existing `COMPLETE`, `SUBMITTED`, `ERROR` | ✓ |
| In-progress: existing `PROCESSING` | ✓ |
| Gating processor: `PENDING_PAYMENT` status, no event | ✓ |
| Gating processor: deferred payload returned | ✓ |
| Gating processors called sequentially | ✓ |
| First deferred result captured when multiple gating | ✓ |
| Gating processor error propagates | ✓ |

#### `SubmissionPipelineService` — Well Covered (Unit + Integration)

Unit spec covers: `pinVersion` (version override from draft, not-found errors), `validateActiveFields` (valid, required error, skip hidden), `buildAuditTrail` (schema, fields, visitedPages, timestamps).

Integration spec (`submission-pipeline.integration.spec.ts`, 556 lines) adds real `evaluateFormConditions` + `validate` against a multi-step form:

| Integration Scenario | Tested |
|---|---|
| JM nationality — employment step visible | ✓ |
| US nationality — employment step hidden (stale data ignored) | ✓ |
| `permanent` contract — `job-title` required and empty | ✓ |
| `permanent` contract — `job-title` required and filled | ✓ |
| Cross-field: salary < minimum-wage fails | ✓ |
| Cross-field: salary > minimum-wage passes | ✓ |
| File: wrong type | ✓ |
| File: exceeds `itemMaxSize` | ✓ |
| Validation stops at first failing step | ✓ |
| Audit trail schema/metadata | ✓ |

#### `ProcessorFactory` — Well Covered

- `resolve`: multiple handlers, single, empty, unknown type with logger warn, partial registry
- `resolveSplit`: gating vs non-gating split, empty config

#### `SubmissionProcessorListener` — Covered

- Only non-gating processors run; gating processors skipped
- Continues to next processor when one throws (error isolation)

#### Submission Processors — Well Covered

**`EmailProcessor` (updated):** recipient resolution, sender, subject (default/custom), SES tags, config set, missing `recipientField`, unresolvable recipient. New test block covers template rendering paths:
- Renders `submission-confirmation` template for every form via `EmailBodyBuilder`
- Delegates structured context to `EmailBodyBuilder`
- Falls back to generic HTML string when `EmailBodyBuilder` throws (e.g. DB unavailable)
- Falls back to generic HTML when template render returns `null`
- Falls back to generic HTML when neither `EmailBodyBuilder` nor `EmailTemplateService` is injected

**`OpencrvsProcessor`:** POST to endpoint, body shape, idempotency header, auth header (with/without token), missing endpoint warning, non-OK HTTP response.

**`SpreadsheetProcessor`:** directory creation, first submission (header+data rows), append to existing, filename fallback, retry safety (skip duplicate submission), column flattening.

**`PaymentProcessor`:** create payment flow, idempotent retry (already INITIATED/PENDING), missing `customerEmailPath`, missing `customerNamePath`, missing department key, EzPay error propagation.

**`EzpayClient`:** `createPayment` (POST body, token+URL, error response), `verifyPayment` (reference in body, null `dateSettled`, Failed status), `queryTransactions` (date headers, Cart reference mapping, empty result).

#### `PaymentWebhookController` — Well Covered (Security Paths)

Verification disabled (signature ignored, default behaviour), verification enabled (invalid sig → 403, valid sig → forwarded, missing secret → 403, missing header → 403, missing rawBody → 500).

#### `PaymentWebhookService` — Well Covered

Success + amount match, amount mismatch → MISMATCHED, idempotency (already SUBMITTED), payment not found, EzPay Failed status, existing transaction row merge.

#### `RegistryService` — Well Covered

`mergeEntry` (deep clone, no mutation, primitive overrides, block field overrides, unspecified elements unchanged, block not mutated); `hydrateStep` (resolves elements, flattens block ref into primitives, unknown ref throws `UnresolvableComponentError`); `hydrateForm` (full hydration, metadata preserved); `RegistryService.resolve` (builtin component, builtin block, unknown → null, custom from DB); `RegistryService.hydrateForm` (component refs, primitive overrides, block flattening, block field overrides, mixed refs, unknown ref throws).

#### `EmailBodyBuilder` — Well Covered (new)

**Spec file:** `src/email/email-body.builder.spec.ts` (30+ tests)

| Scenario | Tested |
|---|---|
| Metadata fields populated (formId, title, submittedAt, referenceNumber) | ✓ |
| Contract fetched with correct formId + version from audit trail | ✓ |
| One `EmailSection` produced per active, visible step | ✓ |
| Plain text field → value passed through as-is | ✓ |
| Radio field → option label resolved from schema | ✓ |
| Checkbox field → selected labels joined | ✓ |
| Single-select field → option label resolved | ✓ |
| Multi-select field (`multiple: true`) → all selected labels joined | ✓ |
| Step in `hiddenStepIds` → excluded from sections | ✓ |
| Step not in `activeStepIds` → excluded | ✓ |
| Field in `hiddenFieldIds` → excluded from section rows | ✓ |
| Field not in `activeFieldIds` → excluded | ✓ |
| `activeFieldIds` key absent → all fields included | ✓ |
| `file` and `show-hide` field types omitted entirely | ✓ |
| Empty section (all fields hidden/omitted) → section excluded | ✓ |
| Raw value fallback when option label not found in schema | ✓ |
| Repeatable step: multiple instances → numbered titles ("Director (1)", "Director (2)") | ✓ |
| Repeatable step: single instance → unnumbered title | ✓ |
| Repeatable step: empty instances skipped | ✓ |
| V2 audit trail: `string[][]` `activeFieldIds` — union of arrays flattened correctly | ✓ |
| V2 audit trail: `string[][]` `hiddenFieldIds` — union of arrays flattened correctly | ✓ |
| Contract caching: same formId+version only fetched once | ✓ |
| Contract caching: different versions produce separate cache entries | ✓ |

#### `EmailTemplateService` — Well Covered (updated)

| Scenario | Tested |
|---|---|
| Template discovery from filesystem (all `.hbs` files in templates directory) | ✓ |
| Unknown template name → `hasTemplate` returns `false`, `render` returns `null` | ✓ |
| Renders `submission-confirmation` with structured `EmailTemplateContext` | ✓ |
| Empty `sections` array handled without error | ✓ |
| Render crash (Handlebars error) → returns `null`, does not throw | ✓ |

---

### 3.5 `apps/api` — Untested Source Files

These files have no corresponding `.spec.ts` file.

| File | Complexity | Risk |
|---|---|---|
| `src/app.controller.ts` | Low | Low — health check only |
| `src/common/response.interceptor.ts` | Low | Low — status code injection |
| `src/common/exception.filter.ts` | Medium | **High** — shapes all error responses, integrates OpenTelemetry and metrics |
| `src/forms/form-drafts/form-drafts.controller.ts` | Low | Medium — 4 HTTP endpoints untested |
| `src/forms/form-definitions/form-definitions.controller.ts` | Low | Medium — HTTP endpoints untested |
| `src/payments/payment-reference.ts` | Unknown | Medium — payment reference generation logic |
| `src/telemetry/metrics.service.ts` | Medium | Low — observability only, not business logic |
| `src/database/base.repository.ts` | Low | Low — thin TypeORM wrapper |
| `src/forms/submissions/form-submission.repository.ts` | Low | Low — thin TypeORM wrapper with `tx()` helper |
| `src/forms/form-definitions/form-definition.repository.ts` | Low | Low — thin TypeORM wrapper |
| `src/forms/form-drafts/form-draft.repository.ts` | Low | Low — thin TypeORM wrapper |

---

### 3.6 `apps/forms` — E2E and Unit Coverage

#### 3.6.1 Playwright E2E Suite

**Config:** `playwright.config.ts` — Chromium only, baseURL `http://localhost:3000`, actionTimeout 10 s, navigationTimeout 30 s, retries 2 in CI, `webServer` starts `npm run dev` automatically.

**Estimated E2E coverage:** ~55% of user-facing behaviour paths

| Spec file | Scenarios covered |
|---|---|
| `e2e/master-contract.spec.ts` | Full happy path: all 7 form steps → CYA → declaration → confirmation; session storage reload persistence |
| `e2e/navigation.spec.ts` | Step guard (direct URL to later step redirects to start), forward/back navigation, field value preservation across navigation, CYA change links navigate to correct step, step titles rendered for all named steps |
| `e2e/conditionals.spec.ts` | `fieldConditionalOn` with `equal` (national-id "bb"), `exists` (previous-address checkbox), `in` (employment-status: employed/self-employed/unemployed/retired/student); `stepConditionalOn` (telephone exists gate); radio conditional reveal `[data-radio-conditional]` (has-bank-account, fund-source) |
| `e2e/validations.spec.ts` | All validation rules exercised across 5 steps: `required`, `minLength`, `maxLength`, `pattern` (name/NINO/postcode/telephone/swift-code), `email` format, `strictEquality` (confirm-email mismatch), `date` past/maxYear/minYear, `minSelection`, `number` min/max, `file` required/fileTypes/itemMaxSize/minItems/maxItems |
| `e2e/repeatable.spec.ts` | Source step: shared `has-bank-account` visible, no `addAnother`; first repeat instance: shared fields absent, `addAnother` radio present; Yes → new instance, No → CYA; 4 instances created; independent data per instance; `middle-name` field array (add/remove, max=4 enforced) |
| `e2e/file-upload.spec.ts` | Add file, remove file, invalid MIME type error, `itemMaxSize` exceeded error, required error, `proof-of-address` minItems/maxItems/maxSize, `additional-documents` field array behaviour, full happy-path file submission |

#### What E2E Does Not Cover

- React component rendering in isolation (no unit-level snapshot or accessibility tests)
- Hook logic independent of DOM (e.g. `use-step-guard` state machine in isolation)
- Error boundary rendering and recovery
- Component prop edge cases not reachable via the master contract form definition
- Draft save/load behaviour at a granular level

#### 3.6.2 Jest Unit Suite

**Config:** `apps/forms/jest.config.ts` — `ts-jest`, `testEnvironment: "node"`, `rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"`. Path aliases mapped for `@govtech-bb/*` workspace packages and `@forms/*` internal aliases.

**Spec file:** `src/lib/form-builder/form-query.spec.ts` (13 tests)

| Describe block | Scenarios |
|---|---|
| `formSchemaCacheKey` | Returns `[FORM_SCHEMA_CACHE_KEY, formId, version]` tuple; same args → equal keys; different versions → different keys |
| `contractQueryOptions` | `queryKey` is `[CONTRACT_CACHE_KEY, formId]`; `staleTime` is 60 s; `queryFn` is defined |
| `formMetaQueryOptions` | `queryKey` includes version (`[FORM_SCHEMA_CACHE_KEY, formId, version]`); `staleTime` is `Infinity`; different versions → different keys |
| `QueryClient form caching` | Seeded data served without calling `queryFn`; cold start calls `queryFn` once; version bump is a cache miss (v1 entry remains untouched); second `ensureQueryData` call with same key is a cache hit |

#### Web Components — Still Untested at Unit Level

The following source files have no Jest spec and are not individually exercised by E2E (behaviour is covered but component internals are not):

| Component/File | Logic Present | Risk |
|---|---|---|
| `src/components/form-renderer.tsx` | Multi-step form orchestration, step navigation | High |
| `src/components/field-renderer.tsx` | Field type dispatch (text, file, select, checkbox…) | High |
| `src/components/review.tsx` | Review page: format and display submitted values | High |
| `src/hooks/use-step-guard.tsx` | Navigation guard — blocks skipping required steps | High |
| `src/components/file-upload.tsx` | File selection, preview, removal logic | Medium |
| `src/components/error-summary.tsx` | Error collection and display | Medium |
| `src/components/error-message.tsx` | Single error message rendering | Low |
| `src/components/form-error.tsx` | Form-level error display | Low |
| `src/components/submission-confirmation.tsx` | Post-submit confirmation | Low |
| `src/routes/forms/$formId/index.tsx` | Form route — loads form definition, manages draft | High |

---

## 4. Test Quality Assessment

### Strengths

1. **Consistent factory pattern** — all spec files use `makeEntity()`, `makeMocks()`, `makeDraft()` helpers that produce valid test data, making tests readable and reducing test setup duplication.
2. **Good isolation** — services are tested in isolation using NestJS `Test.createTestingModule()` with mocked dependencies; the real integration test explicitly documents that only DB services are mocked.
3. **Both happy path and error paths** — all service specs cover `NotFoundException`, `BadRequestException`, `UnprocessableEntityException` as appropriate.
4. **Edge cases are well handled** — numeric `0`, boolean `false`, empty arrays, `null`, `undefined`, and whitespace-only strings are explicitly tested in the validation rules.
5. **Idempotency tested** — the payment processor, submission service, spreadsheet processor, and payment webhook service all have idempotency scenarios.
6. **Security-relevant paths tested** — HMAC webhook signature verification is tested with valid signature, invalid signature, missing secret, missing header, and missing raw body.
7. **Cross-field validation tested** — `strictEquality`, `gt`, and date `after` all have tests with `targetStepId` scoping and flat fallback.
8. **Custom error messages tested** — all rule runners verify that a custom `error` string overrides the default.
9. **Integration test bridges unit gaps** — `submission-pipeline.integration.spec.ts` (556 lines) confirms that the conditions and validation packages compose correctly through the full pipeline.
10. **E2E suite covers all major user journeys** — Playwright specs exercise navigation guards, conditional visibility (all operators), all validation rule types, repeatable steps, field arrays, and file uploads against a real browser.
11. **Email module fully tested** — `EmailBodyBuilder` has 30+ tests covering every field type, visibility filtering (step/field hide), repeatable step numbering, V2 audit trail format, and contract caching behaviour; fallback paths in `EmailProcessor` are verified for DB failures and template errors.

### Weaknesses

1. **No coverage numbers** — without `collectCoverage: true`, estimated percentages in this document cannot be verified automatically.
2. **Controller layer untested** — no HTTP-level tests means request parsing (path params, body DTOs, query params), response serialisation, and HTTP status codes are unverified.
3. **GlobalExceptionFilter untested** — the global error handler shapes every error response the client sees; it also integrates OpenTelemetry span recording and metric counters, none of which are exercised in tests.
4. **No React component unit tests** — `apps/forms` Jest config uses `testEnvironment: "node"`; component rendering, hook state, and accessibility cannot be verified without `jsdom`.
5. **E2E depends on a running dev server** — Playwright tests are slow to run in CI (Chromium launch + Vite startup), are brittle to UI text/selector changes, and do not provide branch-level coverage data.
6. **`form-types` coverage is partial** — step schemas, field schemas, condition behaviour schemas, and validation rule schemas remain untested.
7. **No test scripts for shared packages** — `packages/form-conditions`, `packages/form-validation`, `packages/form-types` cannot be tested via `npm test`; they require an Nx command, making them invisible to developers running `npm test` at the root.

---

## 5. Uncovered Code Paths and Edge Cases

### 5.1 High Priority (Business Logic)

| Gap | Location | Risk |
|---|---|---|
| `GlobalExceptionFilter` — HttpException vs generic error branching | `apps/api/src/common/exception.filter.ts` | High — all client-visible errors pass through here |
| `GlobalExceptionFilter` — metrics counter when status is 400 | `apps/api/src/common/exception.filter.ts` | Medium |
| `FormDraftsController` — all four CRUD endpoints | `apps/api/src/forms/form-drafts/form-drafts.controller.ts` | Medium |
| `SubmissionPipelineService.pinVersion` — no `draftId` path | `apps/api/src/forms/submissions/submission-pipeline.service.ts:39` | Medium — `draftId` is optional; the codepath returning `null` draft has no test |
| `payment-reference.ts` — reference generation algorithm | `apps/api/src/payments/payment-reference.ts` | Medium — payment references must be deterministic and unique |
| Web `form-renderer` — draft save, submit, error boundary | `apps/forms/src/components/form-renderer.tsx` | Medium — step navigation covered by E2E, but component-level state not unit tested |
| Web `use-step-guard` — hook state machine in isolation | `apps/forms/src/hooks/use-step-guard.tsx` | Medium — guard behaviour covered by E2E navigation spec, not unit tested |
| Web `field-renderer` — prop edge cases per field type | `apps/forms/src/components/field-renderer.tsx` | Medium — all field types covered by E2E validation spec, not unit tested |

### 5.2 Medium Priority (Edge Cases in Tested Code)

| Gap | Location |
|---|---|
| `evaluateFormConditions` — empty steps array | `packages/form-conditions` |
| `validate()` — unknown rule key in validations object (passthrough) | `packages/form-validation/src/index.ts` |
| `afterRunner` — reference field value is non-date string | `packages/form-validation/src/rules/date.ts` |
| `fileTypesRunner` — mixed batch where first file passes but second fails | `packages/form-validation/src/rules/file.ts` |
| `gtRunner` — referenced field is a non-numeric value | `packages/form-validation/src/rules/number.ts` |
| `SubmissionsService.submit` — `PENDING_PAYMENT` existing status path | `apps/api/src/forms/submissions/submissions.service.ts` |
| `SpreadsheetProcessor` — export directory already exists (no `mkdirSync` error) | `apps/api/src/forms/submissions/processors/spreadsheet.processor.ts` |
| `EmailBodyBuilder` — `activeStepIds` key absent (all steps visible) | `apps/api/src/email/email-body.builder.ts` |
| `serviceContractRecipeSchema` — no tests (parallel to tested `serviceContractSchema`) | `packages/form-types/src/service-contract.type.ts` |
| `dateTimeFormatSchema` — boundary cases (no milliseconds, non-UTC offset) | `packages/form-types/src/service-contract.type.ts` |

### 5.3 Deterministic Logic Loops to Verify

These loops exist in production code and need explicit boundary tests:

| Loop | Location | Test Needed |
|---|---|---|
| `validateActiveFields` iterates steps; stops at first failing step | `submission-pipeline.service.ts:68` | Already tested in integration spec; unit spec also covers it |
| `SubmissionsService` iterates gating processors sequentially | `submissions.service.ts` | Sequencing tested; but test only covers 2 processors — consider N>2 |
| `SubmissionProcessorListener` iterates non-gating processors; catches and logs errors | `submission-processor.listener.ts` | Error isolation with 2 processors tested; N>2 untested |
| `SpreadsheetProcessor` scans all rows for duplicate submissionId | `spreadsheet.processor.ts` | Only tested with 2 rows; large sheet not tested |
| `RegistryService.hydrateForm` iterates steps → elements | `registry.service.ts` | Tested with 1 and mixed blocks; zero-element step untested |

---

## 6. Recommended Testing Plan

### Phase 1 — Coverage Tooling (Immediate, ~1 day)

**Goal:** Establish a measurable baseline.

1. Add `collectCoverage: true`, `collectCoverageFrom`, and `coverageReporters` to each `jest.config.ts`:

```typescript
// apps/api/jest.config.ts (and each package's config)
const config: Config = {
  // ...existing config
  collectCoverage: true,
  collectCoverageFrom: [
    "**/*.ts",
    "!**/*.spec.ts",
    "!**/*.module.ts",
    "!**/migrations/**",
    "!**/entities/**",
    "!**/dto/**",
    "!**/*.docs.ts",
    "!**/main.ts",
    "!**/tracing.ts",
  ],
  coverageReporters: ["text-summary", "lcov", "html"],
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
};
```

2. Add `"test": "jest --config jest.config.ts"` to `packages/form-conditions/package.json`, `packages/form-validation/package.json`, and `packages/form-types/package.json`.

3. Add a root-level `"test:all"` script to `package.json` that runs all package tests via Nx or npm workspaces.

---

### Phase 2 — High-Priority API Gaps (Within Current Sprint, ~3 days)

#### 2.1 `GlobalExceptionFilter` — `apps/api/src/common/exception.filter.ts`

```
Tests needed:
- HttpException (4xx) → returns correct status + message shape
- Generic Error → returns 500
- 400 BadRequest → calls metricsService.recordValidationFailure
- All HTTP errors → calls metricsService.recordHttpError
- OpenTelemetry span recording (span.setStatus, span.recordException)
- No active span → no crash
```

#### 2.2 `FormDraftsController` — `apps/api/src/forms/form-drafts/form-drafts.controller.ts`

```
Tests needed (NestJS testing module):
- POST / → calls service.create, returns 201 with ApiResponse.success shape
- GET /:draftId → calls service.findById, returns 200
- PATCH /:draftId → calls service.update, returns 200
- DELETE /:draftId → calls service.abandon, returns 204
- Service throws NotFoundException → filter propagates 404
```

#### 2.3 `SubmissionPipelineService.pinVersion` — no `draftId` path

```
Test needed:
- dto.draftId is undefined → calls formDefinitionsService.findByFormId directly,
  returns { draft: null, contract }
```

#### 2.4 `payment-reference.ts`

```
Tests needed:
- Generated reference matches expected format/length
- Two calls with different inputs produce different references
- Function is deterministic given the same inputs (if deterministic by design)
```

---

### Phase 3 — Web React Component Unit Testing (Next Sprint, ~2 days setup + ongoing)

**Status:** Playwright E2E is now installed and covers all major user journeys. The remaining gap is React component unit tests, which require switching the Jest environment to `jsdom`.

1. Update `apps/forms/jest.config.ts` to enable React component testing:

```typescript
const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",    // ← change from "node"
  setupFilesAfterFramework: ["<rootDir>/test/setup.ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.tsx?$",
  moduleNameMapper: { /* existing mappers */ },
  transform: { "^.+\\.tsx?$": ["ts-jest", { useESM: false }] },
};
```

2. Install React Testing Library:

```bash
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

3. Priority test order for web components:

| Component | Test type | Priority |
|---|---|---|
| `use-step-guard` hook | Unit (renderHook) | 1 |
| `field-renderer` | Unit (render + snapshot per field type) | 2 |
| `error-summary` | Unit (render with errors) | 3 |
| `form-renderer` | Integration (full step navigation) | 4 |
| `review` | Integration (value display) | 5 |
| Routes | Integration (React Router) | 6 |

> **Design System Note:** Any new testing utility UIs or coverage visualisation screens (e.g., a coverage dashboard page in the web app) must follow the Alpha Gov Design System. Use GOV.UK-style typography, colour tokens, and components — no custom colour palettes or non-standard typefaces.

---

### Phase 4 — Remaining API and Schema Gaps (Backlog)

| Item | Effort |
|---|---|
| `FormDefinitionsController` spec | Small |
| `ResponseInterceptor` spec | Small |
| `BaseRepository` spec | Small |
| `FormSubmissionRepository.tx()` helper | Small |
| `MetricsService` spec | Medium |
| Supertest/E2E spec for full HTTP cycle (at least one form submission) | Large |
| Increase `form-types` Zod schema coverage (step, field, condition, validation schemas) | Medium |
| `serviceContractRecipeSchema` tests | Small |
| `dateTimeFormatSchema` boundary tests | Small |

---

## 7. Coverage Targets

Once tooling is in place (Phase 1), aim for the following thresholds within 4 sprints:

| Workspace | Current (est.) | Sprint 1 Target | Sprint 4 Target |
|---|---|---|---|
| `packages/form-conditions` | ~90% | 90% (enforce) | 95% |
| `packages/form-validation` | ~90% | 90% (enforce) | 95% |
| `packages/form-types` | ~50% | 60% | 80% |
| `apps/api` (all files) | ~60% | 70% | 85% |
| `apps/forms` (Jest unit — after jsdom) | ~5% | 30% | 65% |

---

## 8. File Inventory

### Tested Files (`.spec.ts` exists)

```
# Shared packages
packages/form-conditions/src/index.spec.ts
packages/form-types/src/processor.type.spec.ts
packages/form-types/src/service-contract.type.spec.ts          ← new (PR #174)
packages/form-validation/src/index.spec.ts
packages/form-validation/src/rules/array.spec.ts
packages/form-validation/src/rules/date.spec.ts
packages/form-validation/src/rules/file.spec.ts
packages/form-validation/src/rules/number.spec.ts
packages/form-validation/src/rules/required.spec.ts
packages/form-validation/src/rules/string.spec.ts

# API — service layer
apps/api/src/email/email-body.builder.spec.ts                  ← new (PR #174)
apps/api/src/email/email-template.service.spec.ts              ← updated (PR #174)
apps/api/src/forms/form-definitions/form-definitions.service.spec.ts
apps/api/src/forms/form-drafts/form-drafts.service.spec.ts
apps/api/src/forms/submissions/processors/email.processor.spec.ts           ← updated (PR #174)
apps/api/src/forms/submissions/processors/opencrvs.processor.spec.ts
apps/api/src/forms/submissions/processors/payment/ezpay/department-keys.spec.ts
apps/api/src/forms/submissions/processors/payment/ezpay/ezpay-signature.spec.ts
apps/api/src/forms/submissions/processors/payment/ezpay/ezpay.client.spec.ts
apps/api/src/forms/submissions/processors/payment/payment.processor.spec.ts
apps/api/src/forms/submissions/processors/processor-factory.service.spec.ts
apps/api/src/forms/submissions/processors/spreadsheet.processor.spec.ts
apps/api/src/forms/submissions/submission-pipeline.integration.spec.ts
apps/api/src/forms/submissions/submission-pipeline.service.spec.ts
apps/api/src/forms/submissions/submission-processor.listener.spec.ts
apps/api/src/forms/submissions/submissions.service.spec.ts
apps/api/src/payments/payment-webhook.controller.spec.ts
apps/api/src/payments/payment-webhook.service.spec.ts
apps/api/src/payments/payment.repository.spec.ts
apps/api/src/registry/registry.service.spec.ts

# Web app — Jest unit
apps/forms/src/lib/form-builder/form-query.spec.ts               ← new (PR #171)

# Web app — Playwright E2E
apps/forms/e2e/master-contract.spec.ts                           ← new (PR #168)
apps/forms/e2e/navigation.spec.ts                                ← new (PR #168)
apps/forms/e2e/conditionals.spec.ts                              ← new (PR #168)
apps/forms/e2e/validations.spec.ts                               ← new (PR #168)
apps/forms/e2e/repeatable.spec.ts                                ← new (PR #168)
apps/forms/e2e/file-upload.spec.ts                               ← new (PR #168)
```

### Untested Production Files (no `.spec.ts`)

```
# API — controller and infrastructure layer
apps/api/src/app.controller.ts
apps/api/src/common/exception.filter.ts          ← HIGH PRIORITY
apps/api/src/common/response.interceptor.ts
apps/api/src/forms/form-definitions/form-definitions.controller.ts
apps/api/src/forms/form-drafts/form-drafts.controller.ts
apps/api/src/forms/submissions/form-submission.repository.ts
apps/api/src/forms/form-definitions/form-definition.repository.ts
apps/api/src/forms/form-drafts/form-draft.repository.ts
apps/api/src/database/base.repository.ts
apps/api/src/payments/payment-reference.ts
apps/api/src/telemetry/metrics.service.ts

# Web app — React components (E2E coverage only, no unit specs)
apps/forms/src/components/form-renderer.tsx        ← HIGH PRIORITY (unit tests blocked by node env)
apps/forms/src/components/field-renderer.tsx       ← HIGH PRIORITY (unit tests blocked by node env)
apps/forms/src/components/review.tsx
apps/forms/src/components/file-upload.tsx
apps/forms/src/components/error-summary.tsx
apps/forms/src/components/error-message.tsx
apps/forms/src/components/form-error.tsx
apps/forms/src/components/submission-confirmation.tsx
apps/forms/src/hooks/use-step-guard.tsx            ← HIGH PRIORITY (unit tests blocked by node env)
apps/forms/src/routes/forms/$formId/index.tsx      ← HIGH PRIORITY (unit tests blocked by node env)
apps/forms/src/routes/index.tsx
```

---

*Generated by Claude (claude-sonnet-4-6) on 2026-05-19 via codebase review of branch `testing/coverage`. Updated to reflect merges from `dev` (PRs #168, #171, #157) and `frontend/staging` (PR #174).*
