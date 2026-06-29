# Migrated apps/api env validation from Joi to Zod (Phase 2 of #1422)

## Context

Phase 2 of issue [#1422](https://github.com/govtech-bb/gov-bb/issues/1422) /
TECH-05. Phase 1 (#1627) gave `form_builder_api` a boot-time Zod schema; this
session migrated `apps/api`'s ~40-var Joi schema to Zod, making Zod the single
env-validation library across the Node services and retiring Joi. Phase 3 — the
convention ADR — was folded into this PR (see decision 0057) since this change
is what completes the convention.

Worked in worktree `gov-bb-wt-1422b` (branch `1422-api-joi-to-zod`, targets
`sandbox`).

## What we did

- **`apps/api/src/config/env.validation.ts`** — rewrote the Joi schema as Zod,
  reproducing every var 1:1: defaults, the `NODE_ENV` enum, `.min(1)` on
  required strings (Joi `.required()` rejects `""`; `z.string()` doesn't),
  numeric coercion + `int`/`min` bounds, `z.url()` for the `.uri()` fields with
  empty-string allowance where Joi had `.allow("")`, and the three conditionals
  (prod CORS guard, `SQS_QUEUE_URL`-when-`SQS_ENABLED`,
  `EZPAY_WEBHOOK_SECRET`-when-verify) via `.superRefine`. The dev CORS default is
  applied in a `.transform`.
- **`app.module.ts`** — `ConfigModule.forRoot` switched from
  `validationSchema: envValidationSchema` to
  `validate: (config) => envValidationSchema.parse(config)`.
- **`env.validation.spec.ts`** — ported from Joi's `.validate()` to a Zod
  `safeParse` adapter; kept every original assertion, added required/conditional/
  coercion/boolean/passthrough/blank-port coverage.
- **`env.validation.bootstrap.spec.ts`** (new) — boots the real NestJS
  `ConfigModule` to prove the `validate:` contract end-to-end.
- **Removed `joi`** from `apps/api/package.json` (+ lockfile).
- **`docs/decisions/0057-env-config-validated-with-zod-at-boot.md`** — the
  convention ADR (Phase 3).

## Why it looks this way

- **Parity was the bar, in both directions.** A schema that rejects a
  currently-deployed config crashes `apps/api` on boot → ECS rollback (the
  documented blast radius, freshly demonstrated by the #1627 prod-CORS/
  `GITHUB_ORG` incident). So the schema was built to accept exactly what Joi
  accepted and reject exactly what Joi rejected — verified field-by-field by a
  review subagent and by running edge cases through both.
- **`.passthrough()` is load-bearing, not cosmetic.** The config factories read
  unknown-but-used vars straight from `process.env` (`AWS_REGION`,
  `AWS_DEFAULT_REGION`, `SES_ENDPOINT`, `EMAIL_ASSET_BASE_URL`) that are not in
  the schema. `.passthrough()` (== Joi's `allowUnknown: true`) keeps them; the
  `validate` hook returns the parsed object so `ConfigModule` writes defaults
  back to `process.env` for keys not already set.
- **The schema is a boot gate, not the runtime source of truth.** Every value is
  consumed through `registerAs` factories that re-read `process.env` with their
  own `?? default` / `=== "true"`. So the schema's return value barely matters
  at runtime — its job is to fail-fast at boot. This actually *reduced* the
  migration risk and reframed it as "preserve accept/reject behaviour", not
  "reproduce the exact coerced return".
- **Boot smoke is a committed integration test, not a manual run.** Build/test
  never boots NestJS, and the built `dist` hits the monorepo workspace-resolution
  quirk under bare `node` (same as Phase 1). So instead of a throwaway manual
  boot, `env.validation.bootstrap.spec.ts` boots the real `ConfigModule` and
  asserts a valid env boots (and the parsed default reaches `process.env`) while
  an invalid env (prod `CORS_ORIGIN=*`) aborts module init. Durable, and guards
  the wiring against regressions.
- **Blank-port parity fix.** Review caught that `z.coerce.number().default()`
  coerces `""`/whitespace to `0`, where `Joi.number()` rejected it. Closed with a
  small `portFromEnv` preprocess that rejects blank strings before coercion —
  without tightening the number semantics Joi allowed (`0`, negatives, floats
  still valid; `"abc"` still rejected). Safe direction, but fixed for exactness.

## Verification

- `pnpm exec nx test api` — 904 pass, coverage gates met (branches 89.11% ≥ 89%).
- `pnpm exec nx run-many -t build --exclude=landing` — 16 projects.
- `pnpm exec tsc -b` — clean. eslint on changed files — clean.
- Boot fail-fast proven both directions via the bootstrap integration spec.

Completes #1422 (all three phases). Joi is gone from the platform.
