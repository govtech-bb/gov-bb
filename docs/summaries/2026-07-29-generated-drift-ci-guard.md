# Session summary — CI guard for generated services-index drift (#2070)

**Date:** 2026-07-29 · **Branch:** `fix-generated-drift-ci-guard-2070` (off `main`) · resolves #2070

## What shipped

A CI job that regenerates `apps/api/src/content/services-index.generated.ts`
from landing content and fails on any diff, so a stale committed index can no
longer merge green. The generator now emits Prettier-formatted output, and the
live drift on `main` was reconciled.

- `scripts/generate-services-index.ts` — formats its output via Prettier's Node
  API (`resolveConfig` + `format` with `filepath`) before writing.
- `.github/workflows/ci.yml` — new `generated-drift` job (mirrors
  `validate-recipes`) running `pnpm generate:services-index` then
  `git diff --exit-code` on the generated file.
- `apps/api/src/content/services-index.generated.ts` — reconciled: pension
  title `"Calculate your pension"` → `"Calculate your Government pension"`, plus
  three previously-missing services (`national-insurance-for-self-employed-workers`,
  `apply-for-temporary-restaurant-licence`,
  `temporary-restaurants-what-you-need-to-know`).

## Why it looks the way it does

- **The generator formats its own output — this is the crux.** The committed
  file is Prettier-formatted (unquoted keys, trailing commas), but the generator
  wrote raw `JSON.stringify` (quoted keys, no trailing commas) — the lint-staged
  hook reformatted it on commit. So the issue's proposed bare `git diff
  --exit-code` would have been **permanently red on formatting alone**,
  regardless of content. Fixing the generator to emit Prettier-formatted output
  (rather than formatting in the CI step) makes generator output == lint-staged
  output == committed, so local regen, CI, and the committed file all agree and
  the guard is a plain diff. Verified: `prettier --check` clean, re-run
  idempotent, and the guard returns 0 when in sync.

- **`filepath` passed to Prettier**, not a hardcoded `parser`, so Prettier infers
  the TypeScript parser exactly as the `prettier --write` hook does — byte-identical
  output.

- **`service-status-seed` is deliberately NOT gated.** It's a frozen one-time
  migration seed (`1783520007424-SeedServiceStatus.ts`, applied once per
  environment). Diff-gating it would make CI fail forever the moment content
  changed after the seed was frozen. Only `services-index` is gated.

- **CI job mirrors `validate-recipes`** (same setup, same `if: github.base_ref
  != 'staging'` skip for promotion-only PRs, same pinned action SHAs) rather than
  inventing a new shape — and uses no `${{ }}` interpolation in `run:` blocks, so
  no GHA-injection surface.

- **Branched off `origin/main`, not local `main`.** Local `main` was 29 commits
  stale (its tip predated the merge of #2075); branching off the fresh
  `origin/main` avoids an outdated base.

## Verification

- `pnpm generate:services-index` → only the content reconciliation changes; a
  second run is a no-op; `prettier --check` passes.
- `nx run api:build` — compiles with the reconciled file.
- CI guard simulated both ways: green when in sync (`git diff --exit-code` = 0),
  red when drifted.
- Full api test suite (run before commit to catch any exact-list assertion on the
  services index).
