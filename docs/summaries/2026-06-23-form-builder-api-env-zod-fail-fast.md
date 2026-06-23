# Boot-time Zod env validation for `form_builder_api` (fail-fast)

## Context

Phase 1 of issue [#1422](https://github.com/govtech-bb/gov-bb/issues/1422) /
TECH-05, from the `apps/` consolidation audit. The audit found env/config loaded
four incompatible ways across the platform — `apps/api` (Joi boot schema),
`apps/chat` (Zod `getServerEnv`), `apps/form_builder_api` (raw `process.env`,
**no validation**), and the Vite-`define` frontends. The concrete, verifiable
gap: `form_builder_api` had no fail-fast on missing config — a missing
`ADMIN_API_TOKEN` surfaced only at request time (`auth.ts` 500), a missing
`GITHUB_ORG` only on publish (#1400), a missing DB var only at first query.

The plan (`docs/plans/1422-env-config-zod-unification.md`) scoped this to
**Phase 1 only** (confirmed 2026-06-23): give `form_builder_api` the boot-time
Zod schema. The `apps/api` Joi→Zod migration (Phase 2) and the convention ADR
(Phase 3) are deferred to separate follow-up issues filed when this lands.

Worked in worktree `1422-fba-env-zod` (branch targets `sandbox`).

## What we did

- **New `apps/form_builder_api/src/config/env.ts`**, modeled on chat's
  `getServerEnv`: an `envSchema = z.object(...)` covering every var the service
  reads. `parseEnv(source = process.env)` is the pure parse (used by tests with
  explicit inputs); `getEnv()` validates `process.env` once and caches.
- **Defaults mirror the existing inline reads exactly** — PORT 3003, DB_PORT
  5432, DB_HOST localhost, DB user/pass postgres, DB_NAME modular_forms,
  BUILDER_RATE_LIMIT 120, AWS_REGION ca-central-1, PUBLISH_BASE_BRANCH dev,
  AI_MODEL the `global.anthropic.claude-haiku-4-5-...` id. So adding the schema
  changes **no runtime value**; it only adds validation.
- **Prod fail-fast guard** (`.superRefine`): when `NODE_ENV === "production"`,
  require `ADMIN_API_TOKEN`, `GITHUB_ORG`, and a non-`*`/non-localhost
  `CORS_ORIGIN`. Dev keeps all three optional.
- **Wired at boot** in `app.ts` — a single `getEnv()` call after the existing
  `import "dotenv/config"`. The read sites still use `process.env.X ?? default`
  inline (depth (a), surgical); the boot call only validates.
- **`env.spec.ts`** (vitest, TDD): defaults populate, numeric coercion, bad-port
  rejection, `=== "true"` boolean flags, dev-permissive, prod-accepts, and a
  fail-fast assertion for each of the three prod-required vars (incl. `*` and
  localhost CORS).

## Why it looks this way

- **Zod, not a new convention.** Zod is already app-wide and already a
  `form_builder_api` dependency (`zod@^4.4.3`); chat's `config/env.ts` is the
  reference. No new dependency, no new pattern — just applying the existing one
  to the holdout service.
- **Defaults mirror code, deliberately — boot-crash blast radius.** A bad
  boot-time config crashes the API → ECS rollback, and CI never boots the
  service so it wouldn't catch it. So the schema mirrors **real deployed env**:
  it only marks a var `required` where the code already hard-fails. `auth.ts`
  and `publish.ts` already hard-fail on `ADMIN_API_TOKEN`/`GITHUB_ORG`, so prod
  must already set them — promoting those to boot-time is safe.
- **The CORS tightening is the one genuinely new runtime behavior.**
  `CORS_ORIGIN` previously defaulted to `"*"` when unset; requiring a real
  origin in prod is new. Kept only after confirming (with Isaiah, 2026-06-23)
  that deployed sandbox/prod set a real non-`*` `CORS_ORIGIN` — otherwise this
  guard would crash boot.
- **Boolean flags use `=== "true"`, not chat's `"1" || "true"`.** db.ts reads
  `DB_SYNCHRONIZE`/`DB_LOGGING` with `=== "true"`; the schema's `boolFlag`
  matches that exactly so `"1"` stays falsy — no behavior drift.
- **Read sites left as-is.** Replacing every `process.env.X ?? default` with
  `getEnv().X` is an optional follow-up (plan depth (b)); doing it now would be
  churn beyond the fail-fast goal ("Simplicity First").
- **No ADR yet.** The convention ADR is Phase 3, deferred — writing it here
  would pre-empt a decision the plan explicitly held back.

## Verification

- `pnpm exec nx test form-builder-api --skip-nx-cache` — 238 passed (incl. the
  10 new env specs); existing `app.spec` stays green with `getEnv()` wired in.
- `pnpm exec nx run-many -t build --exclude=landing` — 16 projects build.
- `pnpm exec tsc -b` — clean.
- **Manual boot smoke** (build/test never boots the service): under
  `NODE_ENV=production`, missing `CORS_ORIGIN` → fails fast with a readable
  `ZodError` ("CORS_ORIGIN must be set to a non-wildcard, non-localhost
  origin"); fully-configured prod env → boots. Run via `tsx` with
  `TSX_TSCONFIG_PATH=tsconfig.dev.json` (the dev runner's config; needed for the
  TypeORM decorator metadata).

Phase 2 (apps/api Joi→Zod) and Phase 3 (convention ADR) follow as separate
issues.
