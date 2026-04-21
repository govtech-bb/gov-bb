# feat: server-side submission pipeline

Adds a full server-side pipeline that runs on every `POST /submissions`. Previously the endpoint only did an idempotency check and persisted raw values.

## What's included

### New shared packages

- `@govtech-bb/form-conditions` — evaluates step and field visibility from a hydrated contract and step-scoped values. `targetStepId` support prevents collisions when the same `fieldId` appears in multiple steps.
- `@govtech-bb/form-validation` — pure TypeScript validation engine with a rule registry covering text, number, date, array, and file rules. Cross-field rules (`gt`, `lt`, `strictEquality`) resolve references by step scope.

### API pipeline (`SubmissionPipelineService`)

1. **Version pinning** — loads the draft, asserts the client-sent `formVersion` matches the pinned draft version, fetches the hydrated contract.
2. **Condition evaluation** — runs `evaluateFormConditions`; hidden steps and their fields are skipped entirely.
3. **Validation** — runs `validate()` on active fields only, per step, stopping at the first failing step. Throws `422` with per-field errors.
4. **Audit trail** — records `activeStepIds`, `hiddenStepIds`, `activeFieldIds`, `hiddenFieldIds`, `visitedPages`, and `pinnedFormVersion` into the `meta` jsonb column. Full unstripped values stored in `values`.
5. **Rate limiting** — `ThrottlerGuard` on `POST /submissions` (10 req / 60s per IP).
6. **Event emission** — emits `submission.created` after persist; `SubmissionProcessorListener` stubs downstream processors (email, payment, opencrvs).

### Web

`validation-builder.ts` now wraps the engine via `z.superRefine()` — one rule implementation, shared between API and web.

## No migration required

`values` and `meta` are existing `jsonb` columns. No schema changes.

## Tests

- 28 unit tests for `form-conditions`
- Full rule suite for `form-validation`
- 12 unit tests for `SubmissionPipelineService`
- 18 integration tests running real conditions + real validation against an inline `ServiceContract` — no mocks except the DB layer
