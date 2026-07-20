# 0057 — Node services validate env with Zod at boot

**Date:** 2026-06-23
**Status:** Accepted
**Issue:** [#1422](https://github.com/govtech-bb/gov-bb/issues/1422) (TECH-05)

## Context

The platform's Node services loaded and validated configuration four
incompatible ways, so "what env does the platform need" was un-answerable from
one place and one service had no fail-fast at all:

- `apps/api` — a Joi boot-time schema (`ConfigModule.forRoot({ validationSchema })`).
- `apps/chat` — a Zod schema parsed per call (`config/env.ts` `getServerEnv()`).
- `apps/form_builder_api` — raw `process.env` reads with **no validation**: a
  missing `ADMIN_API_TOKEN` surfaced only at request time, a missing DB var only
  at first query.
- `apps/form_builder` / `apps/forms` — Vite `define` of `VITE_*` baked at build.

Zod was already used app-wide for domain schemas and is already a dependency of
the three Node services; Joi was the lone holdout. Two issues addressed the gap
in sequence: #1627 gave `form_builder_api` a boot-time Zod schema, and this
change migrated `apps/api` from Joi to Zod — retiring Joi entirely.

## Decision

**Every Node service validates its environment with a Zod schema at startup, and
a thrown `ZodError` fails the boot.** Configuration that is missing or malformed
crashes the process at startup rather than surfacing lazily at request time.

- The reference implementation is `apps/chat`'s `config/env.ts`
  (`envSchema = z.object(...)`, parsed in `getServerEnv()`).
- `apps/form_builder_api` validates via `getEnv()` called once at boot
  (`src/config/env.ts`).
- `apps/api` validates via `ConfigModule.forRoot({ validate: (c) =>
  envValidationSchema.parse(c) })`. The schema bakes in `.passthrough()` (so
  unknown-but-used vars survive, matching the old Joi `allowUnknown: true`) and
  the `validate` hook **returns** the parsed object so NestJS writes defaults
  back to `process.env`.
- **Joi is retired** — removed from `apps/api/package.json`; no service depends
  on it.
- Schemas are a **fail-fast boot gate** and must mirror the **real deployed
  env**: only mark a var required where the code already hard-fails, because a
  schema that rejects a currently-deployed config crashes the service on
  deploy → ECS rollback (see the form_builder_api prod-CORS/`GITHUB_ORG`
  incident).
- **Frontends are out of scope** — `apps/form_builder` and `apps/forms` keep
  Vite `define` of `VITE_*` at build time; this ADR governs Node services only.

## Consequences

- **A new Node service validates env with Zod at boot** — it does not reach for
  Joi, and it does not read `process.env` unguarded for required config. A
  reviewer should push back on either.
- **Adding a `required` var is a deploy-risk change**, not a free tightening:
  confirm every deployed environment already sets it (or the service already
  hard-fails without it) before requiring it, or boot crashes on rollout.
- **`apps/api`'s schema is a boot gate, not the runtime source of truth.** Its
  `registerAs` config factories still read `process.env` directly with their own
  defaults; the schema's job is to accept/reject at boot. Changing a default in
  the schema does not change runtime behaviour unless the matching factory
  default changes too.
- **One place to answer "what config does this service need"** — each service's
  `env` schema enumerates it.
