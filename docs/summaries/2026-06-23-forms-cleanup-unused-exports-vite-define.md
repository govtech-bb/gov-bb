# apps/forms cleanup — unused exports + ADR-0005 vite define drift

**Date:** 2026-06-23
**Branch:** `forms-cleanup-1523-1504`
**Issues:** [#1523](https://github.com/govtech-bb/gov-bb/issues/1523), [#1504](https://github.com/govtech-bb/gov-bb/issues/1504)

## Context

Two small, independent `apps/forms` cleanups that touch disjoint files and
share one verification gate, so they shipped together as one PR.

- **#1523** — a DEAD-09 follow-up: knip flagged a set of exported symbols with
  no consumers. knip over-reports, so every item was grep-verified against real
  consumers (including TanStack route files, barrels, and the live e2e/smoke
  suites) before acting.
- **#1504** — `vite.config.ts` still carried a `define: { "process.env": {…} }`
  block, a direct violation of ADR-0005 ("Vite env vars use `import.meta.env`
  only"). One consumer still read `process.env`.

## What we did

### Part A (#1523) — no runtime behaviour change

Each symbol resolved to one of three actions:

- **Down-scoped** (dropped `export`, used only in-file): `parseMask`,
  `UPLOAD_TIMEOUT`, `primaryButton`, `SubmissionEvent`, `FieldError`.
- **Deleted** (zero consumers): `mockFailedSubmission`, `STEP1`–`STEP5`, and the
  `FormSubmissionBody` request-body type (+ its two barrel re-exports). Deleting
  `FormSubmissionBody` orphaned its `FormValues` import, which was removed too.
- **De-barreled**: the `FieldRenderer` re-export was dropped from
  `components/index.ts` — every consumer already imports it directly from
  `./field-renderer`. The component itself is untouched.

Two issue-framing corrections drove the scoping, both validated against the
code: the e2e suite is **not** stale (33 active specs import its helpers — only
the named symbols are orphaned), and `UPLOAD_TIMEOUT`/`primaryButton` are used
inside `smoke.ts`, so they were down-scoped rather than deleted.

`FormSubmissionResponseBody` and `formValuesSchema` are knip false-positives
(consumed by `responses.type.ts` and `form-draft.type.ts` respectively) and
were left alone.

### Part B (#1504) — close the ADR-0005 drift

- Removed the `define` block; with `VITE_API_URL` already read via
  `import.meta.env` in `forms.ts`/`files.ts`, the block was redundant, so
  `vite.config.ts` collapsed to a plain `defineConfig({...})` (no more
  `loadEnv`/`mode`/`env`).
- `safe-payment-url.ts` was the only `process.env` reader; switched it to
  `import.meta.env.VITE_PAYMENT_ALLOWED_ORIGINS`. The value is read lazily inside
  `getAllowedHosts()`, so per-test overrides take effect without module
  re-import.
- The spec previously hand-mutated `process.env` and carried a `describe.skip`
  placeholder documenting the production gap (browser has no `process`, so the
  override was silently dropped). With the source now on `import.meta.env`, the
  spec drives env via `vi.stubEnv`/`vi.unstubAllEnvs`, the stale NOTE was
  removed, and the skipped block became a real test asserting a custom allowlist
  supplied through `import.meta.env` is honoured.

### ADR-0005 correction

The ADR's Consequences section still claimed `apps/forms` uses ts-jest +
`ts-jest-mock-import-meta`. That's stale — the app is on Vitest 4, which reads
`import.meta.env` natively and drives it with `vi.stubEnv`. Updated that bullet
in place, keeping the historical ts-jest note for any future Vite-on-Jest app.

## Why it looks this way

- **Down-scope over delete** where a symbol is still used in its own file —
  keeps the value, just removes it from the public surface. Deletion was
  reserved for genuinely zero-consumer symbols.
- **No new ADR** — Part B is an instance of ADR-0005, not a new principle. The
  only doc change is correcting the ADR's stale test-runner claim.

## Verification

`tsc -b`, `nx run forms:build` (succeeds with no `define` block — confirms
`VITE_API_URL` was redundant), and `nx run forms:test` (731 passed, **0
skipped** — the previously-skipped #1504 test now runs) all green. knip
afterwards reports only the three deliberately-left false-positives. `forms:lint`
is pre-existing-red and not a CI gate.
