# Shared DataSource env config (ARCH-06)

**Date:** 2026-06-29
**Branch:** `worktree-shared-datasource-env-1408` → merges into `sandbox`
**Issue:** [#1408](https://github.com/govtech-bb/gov-bb/issues/1408) (ARCH-06) — two API DataSource bootstraps reimplemented per app, diverging on prod TLS verification

## What

Added one shared env→DataSource helper to `@govtech-bb/database`
(`packages/database/src/data-source-env.ts`), re-exported from the package
entry, and rewired both API apps onto it:

- `buildSslConfig()` — the canonical SSL policy, moved verbatim from `apps/api`.
- `dbOptionsFromEnv(overrides?)` — maps the `DB_*` env vars to postgres options
  (no `entities`/`migrations`), with dev-friendly defaults.
- `createDataSourceFromEnv(overrides?)` — `createDataSource(dbOptionsFromEnv())`.
- `apps/api/src/database/data-source.ts` → `AppDataSource = createDataSourceFromEnv()`
  (kept its `dotenv.config(...)`, dropped the now-duplicate local `buildSslConfig`).
- `apps/form_builder_api/src/db.ts` → `getDataSource()` uses
  `createDataSourceFromEnv()` (dropped the inline options block,
  `ssl: { rejectUnauthorized: false }`, and the `as any`).

## Why

The duplication wasn't cosmetic — it was the *cause* of a security divergence.
`form_builder_api` skipped DB certificate verification in production
(`rejectUnauthorized: false`) while `apps/api` verified it. Sharing one helper
removes the drift and makes the strict config canonical for both. See decision
record [0061](../decisions/0061-api-datasource-bootstrap-is-shared-and-verifies-tls-in-production.md).

- **apps/api's SSL config is the canonical one.** It was already the stricter,
  more capable implementation (`rejectUnauthorized: true` + `DB_SSL_CA` PEM/path
  support), so consolidation meant adopting it everywhere rather than inventing
  a new policy or making SSL a per-app parameter (the latter would have deferred
  the security fix — explicitly rejected).
- **Adopted form_builder_api's dev defaults** (`localhost`/`postgres`/`postgres`/
  `modular_forms`). Confirmed with the user: harmless for `apps/api` (its `.env`
  overrides them, and the defaults are byte-identical to its `.env.example`),
  and convenient for local dev. Production task defs set every `DB_*` value, so
  defaults never apply there.
- **Import cycle is intentional and safe.** `index.ts` re-exports from
  `data-source-env.ts`, which imports `createDataSource` from `./index`.
  `createDataSource` is referenced only inside a function body (call-time, not
  module-eval), so the partially-initialised barrel during the cycle is never
  observed. Verified by a compiled boot smoke (below) and the passing suite.
- **No `as any` on the options.** `dbOptionsFromEnv` is typed via
  `Omit<Extract<DataSourceOptions, { type: "postgres" }>, "entities" | "migrations">`,
  which the strict `@nx/js:tsc` build accepts — so `form_builder_api`'s old
  `as any` cast is gone.
- **`config/database.config.ts` left untouched.** Confirmed out of scope: it's
  registered via `registerAs('database')` but the runtime DataSource is built
  from `AppDataSource.options` in `database.module.ts`, so it isn't on the
  connection-bootstrap path.

## Notes

- **Test wiring.** `packages/database/vitest.config.ts` only included
  `scripts/**/*.spec.ts`; broadened it to also pick up `src/**/*.spec.ts` so the
  co-located `data-source-env.spec.ts` runs (9 cases: all four `buildSslConfig`
  branches, env defaults/parsing/overrides, entities/migrations exclusion,
  `createDataSourceFromEnv` wiring). No coverage gate on this package.
- **Spec ships in `dist`.** The package tsconfig's `include: ["src/**/*.ts"]`
  compiles the new spec into `dist`. Left as-is — the sibling buildable package
  `form-types` already ships its specs the same way, and the package is
  `private: true`. Matching precedent over a one-off exclude (user's call).
- **Two other `rejectUnauthorized: false` sites are out of scope** and untouched:
  `apps/chat/src/lib/db/index.ts` (already configurable via
  `DB_SSL_REJECT_UNAUTHORIZED`) and `packages/database/scripts/dump-recipes-to-files.ts`.
- **Deploy precondition (accepted risk).** The flip turns on cert verification
  for `form_builder_api` in prod; its ECS task def (`form-builder-sandbox`) must
  trust the RDS CA before this reaches a prod deploy. `apps/api` already verifies
  against the same RDS — evidence it's safe.
- **Verified:** `nx build` for `database`/`api`/`form-builder-api` green;
  `tsc -b` clean (incl. specs); `nx test` for the three projects = 928 passed
  (incl. the 9 new); `database:lint` clean; grep confirms no
  `rejectUnauthorized: false` remains in either app. Boot smoke: built the
  helper, connected to local PG with `NODE_ENV=development` → `ssl: false`, ran
  `select 1`, tore down cleanly.

## Open questions

None.
