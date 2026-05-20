# Phase 2 — High-Priority API Gaps

**Branch:** `testing/coverage`

## Context

Phase 1 wired up coverage collection across all workspaces. The API landed at 60.97% branch coverage — noticeably below its statement/line numbers (~74%). The gap traced directly to four untested paths identified in the coverage analysis: the global exception filter, the form-drafts controller, the `pinVersion` no-draft branch in the submission pipeline, and the payment reference generator.

## What we did

- **`exception.filter.spec.ts`** (new) — drives `GlobalExceptionFilter.catch()` directly with a mock express Response and a mock `MetricsService`. Tests cover: response shape for `HttpException` (400, 404) and generic `Error` (→ 500); `recordValidationFailure` called only on 400; `recordHttpError` called on every error; active OpenTelemetry span triggers `setStatus` and `recordException`; missing span does not throw.

- **`form-drafts.controller.spec.ts`** (new) — calls controller methods directly (no HTTP server, no supertest). All four routes covered plus `NotFoundException` propagation from `findById`.

- **`submission-pipeline.service.spec.ts`** (modified) — added the missing `draftId = undefined` branch test: `findById` is skipped, `findByFormId` is called with `formId + formVersion`, result carries `draft: null`.

- **`payment-reference.spec.ts`** (new) — `generatePaymentReference` wraps `randomUUID()`. Tests confirm non-empty string, UUID v4 format, and that two successive calls produce distinct values. No determinism test because the function is intentionally random.

- **`apps/api/jest.config.ts`** — thresholds tightened to sit ~1–2 points below the new measured values (branches 62, functions 68, lines 77, statements 78), up from the Phase 1 floor (60/64/72/73).

## Why we did it that way

**OpenTelemetry mocking via `jest.mock`** — `trace.getActiveSpan()` is a module-level call inside `catch()`, so it must be mocked at the module boundary rather than injected. `jest.mock('@opentelemetry/api', ...)` replaces the entire module, which lets individual tests toggle span presence with `mockReturnValue`.

**Controller methods called directly** — the controller is a thin delegation layer (call service → wrap in `ApiResponse`). Calling methods directly is faster and avoids the complexity of standing up a NestJS HTTP adapter just to exercise three lines of code. The filter and middleware layers are tested separately.

**No determinism test for `payment-reference`** — the source wraps `node:crypto`'s `randomUUID()`, which is inherently non-deterministic. Mocking `randomUUID` to test determinism would be testing the mock, not the function. The UUID format and distinctness tests are sufficient.

## Coverage after Phase 2

| Metric | Before (Phase 1 actual) | After (Phase 2 actual) |
|---|---|---|
| Statements | ~73% | 79.23% |
| Branches | ~61% | 63.57% |
| Functions | ~64% | 69.84% |
| Lines | ~72% | 78.74% |

## Open items

- Branch coverage (63.57%) is still the lowest metric. The remaining gap sits in untested conditional paths in controller and service files not yet covered by Phase 2. Phase 4 adds `form-definitions.controller.spec.ts` and `response.interceptor.spec.ts` which should push this higher.
