# Seed `service_status` from current static visibility (#1650)

## Context

Epic [#1650](https://github.com/govtech-bb/gov-bb/issues/1650) makes service
visibility a runtime, DB-driven toggle (`service_status`) instead of a
redeploy-gated source edit. The tables (#1876) and API (#1886) exist and the
admin UI (#1898) is in flight, but with **no rows** the admin UI would default
every service to `enabled` — hiding the true, current state of the platform. In
a planning session with Isaiah on 2026-07-08 we decided to **seed one row per
existing service** from its current static visibility (landing frontmatter +
form recipe), applied once per environment by the existing deploy migrate gate.
This **supersedes** the 1896/1897 plan's non-goal ("absence-of-row *is* the seed
mechanism").

Plan: `docs/plans/1650-service-status-seed-migration.md`. Worked in worktree
`service-status-seed-1650`, branch of the same name, **based on `origin/main`**
and targeting `main` (trunk).

## What we did

Four pieces, split so the derivation is pure and unit-testable while the
IO/format lives in a thin generator:

- **Pure builder** — `packages/database/scripts/build-service-status-seed.ts`
  (+ spec). `buildServiceStatusSeed(contentEntries, formVisibilities)` →
  `{ rows, warnings }`, implementing the agreed derivation table. Canonical slug
  = frontmatter `form_id` when declared (even if it matches no recipe — both
  consumers look up by the declared binding), else the content slug; form-only
  services key by recipe `formId`. Throws on duplicate canonical slugs (forced
  human resolution, no silent pick); rows sorted by slug for stable diffs.
- **Generator (tsx)** — `scripts/generate-service-status-seed.ts`, mirroring
  `generate-services-index.ts`: `loadContent()` + `buildServicesIndex()` for the
  content side, `readdir` of the served flat recipes + `getRecipeVisibility()`
  for the form side. Writes the committed
  `packages/database/src/migrations/service-status-seed.data.ts`.
- **Migration** — `1783520007424-SeedServiceStatus.ts`. `up()` runs one
  `INSERT … ON CONFLICT (slug) DO NOTHING` CTE per row that also writes the
  first audit entry (`old_state` NULL, author `seed:#1650`). Insert-only: a
  pre-existing row (admin toggled before the seed ran) is untouched and gets no
  audit row. `down()` is a deliberate no-op — a seeded row is indistinguishable
  from a later admin toggle, so reverting must not delete rows.
- **DB-backed smoke spec** — asserts the seed+audit shape, idempotency on a
  second `up()`, and the pre-existing-row-survives-untouched semantics against a
  live local Postgres.

Result: **101 rows** — `enabled=25`, `form_disabled=6`, `disabled=70`. 18
warnings, all info-only public pages (e.g. `register-a-birth`,
`terms-conditions`) seeded `enabled` per the agreed flag; **zero** dangling
`form_id`s.

## Why it looks the way it does (decisions that don't survive in the diff)

- **Builder imports `ServiceStatus` as a _type only_.** The obvious
  `import { ServiceStatus } from "../src/entities"` crashes the tsx generator:
  importing the entity barrel evaluates TypeORM's `@PrimaryGeneratedColumn`
  decorators, which esbuild/tsx's decorator transform can't handle
  (`Cannot read properties of undefined (reading 'constructor')`). Vitest (swc)
  tolerates it, so the unit spec still imports the enum for readable assertions,
  but the builder declares local runtime string constants and keeps the enum
  reference type-only (`type SeedStatus = ` + "`${ServiceStatus}`" + `) so a
  drift is still a compile error.
- **Smoke spec lives in `apps/api`, not `packages/database`** — a deliberate
  deviation from the plan. Every DB-backed smoke spec sits in
  `apps/api/src/database/migrations/` gated by `HAS_DB = !!process.env.DB_HOST`,
  because nx injects `apps/api/.env` (→ `DB_HOST`) for that project's tests.
  Placed in `packages/database` it would have silently skipped (no DB env) and
  given false confidence.
- **The generator/builder sit outside CI's `tsc -b` graph** (root `tsc -b`
  references only form-types/conditions/validation/forms/api; script dirs are
  not projects) and Vitest's esbuild transform doesn't type-check. So they get
  no CI type-checking — same as the existing `generate-services-index.ts`. We
  type-checked them explicitly with a one-off `tsc --noEmit`, which caught a
  real `getRecipeVisibility` parameter-type mismatch (`meta.visibility` is
  required in its `Pick<ServiceContractRecipe, "meta">` param, not optional).
- **The committed generated file is prettier-formatted**, matching
  `services-index.generated.ts`: the generator emits raw `JSON.stringify`
  (quoted keys, no trailing commas), and lint-staged reformats on commit. A raw
  re-run of the generator therefore shows a formatting-only diff until prettier
  runs — this is the established repo convention, not new.

## Verification

`nx run database:test` (builder matrix + `migrations-registered` guard),
`nx run api:test` (1058 incl. the 3 seed smoke tests, confirmed running against
the live DB), root `tsc -b` (CI type-check), `nx run-many -t build
--exclude=landing` (18 projects) — all green. Generator output is deterministic
(sorted, stable) at the data level.

## Follow-ups

- **Drift window:** rows freeze at generation time. If a content/recipe
  visibility PR merges before this one, re-run `pnpm generate:service-status-seed`
  before merging.
- The "row overrides repo visibility / repo is seed-default only" principle is
  recorded by **ADR 0063** (consumer gates #1896/#1897), not duplicated here.
