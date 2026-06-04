# 0006 — Exclude infrastructure files from Jest coverage collection

**Date:** 2026-05-22
**Status:** Accepted

## Context

`apps/api` uses Istanbul V8 coverage via Jest. Without exclusions, the
denominator includes every `.ts` file matched by the `collectCoverageFrom`
glob — including files that cannot meaningfully be unit-tested:

- **NestJS ConfigFactory functions** (`config/app.config.ts`, `config/database.config.ts`,
  `config/email.config.ts`, `config/spreadsheet.config.ts`, `config/sqs.config.ts`,
  `config/index.ts`) — these are plain factory functions that read from
  `process.env`. They are invoked by the DI container at bootstrap; there is no
  useful assertion to make without spinning up the full module graph.
- **`database/data-source.ts`** and **`database/seed.ts`** — these require a
  live database connection to do anything; testing them in isolation is
  equivalent to testing TypeORM itself.
- **`tracing.ts` / `tracing.interceptor.ts`** — these wire up OpenTelemetry
  instrumentation. Mocking the entire OpenTelemetry SDK is more noise than
  signal.
- **Registry behavior builders** (`registry/builtins/behaviors/**`) — excluded
  consistent with the existing `!**/form-builder/**` policy (form-authoring
  logic lives in shared form-builder libraries and is tested there).
- **`payment.events.ts`** — a barrel of typed event constants; zero executable
  branches.

Counting these files as 0%-covered drags all four metrics (statements, branches,
functions, lines) below the 90% target without any test being wrong or missing.

## Decision

Files that satisfy any of the following criteria are added to the
`collectCoverageFrom` exclusion list in `apps/api/jest.config.ts` rather than
written tests for:

1. **DI-bootstrap-only** — the file's only runtime effect is registering itself
   with the NestJS module graph (ConfigFactory, module decorator files).
2. **Live-infrastructure-required** — the file cannot execute without a real
   database connection, message queue, or external service SDK.
3. **Instrumentation wiring** — the file configures observability/tracing
   infrastructure at process startup.
4. **Form-builder policy** — already excluded by the existing `!**/form-builder/**`
   rule that applies across all packages.
5. **Pure constant barrel** — the file exports only typed constants with no
   branches or callable logic.

New files that fall into these categories should be added to the exclusion list,
not stubbed with empty tests.

## Consequences

- Coverage percentages reflect only code that can be meaningfully unit-tested.
  The 90%+ thresholds are therefore an honest signal about logic coverage, not
  inflated by excluded infrastructure.
- When a new config file, data-source, or tracing shim is added to `apps/api`,
  the author should explicitly add it to the exclusion list. Leaving it included
  will silently drag coverage below threshold on the next CI run.
- The exclusion list in `jest.config.ts` is the canonical record of what is
  considered "untestable infrastructure" in this package. If a previously excluded
  file gains meaningful logic (e.g. a config factory that does non-trivial
  transformation), it should be un-excluded and tested.
