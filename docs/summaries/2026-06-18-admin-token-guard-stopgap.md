# Stopgap @AdminToken() guard for admin endpoints (#286)

/ 2026-06-18 · `apps/api`

## What this was

Three admin endpoints (form kill-switch enable/disable, draft archive) had no
`@UseGuards` — the only control was a network ACL plus a "no auth until #11"
comment. Anyone reaching the API could disable any live citizen form or delete
form-definition rows (severity: critical). This adds the **stopgap** from the
issue's suggested resolution; real per-user auth (#11) stays out of scope.

## What changed

- **`common/admin-token.guard.ts`** — `AdminTokenGuard` (`CanActivate`):
  `x-admin-token` header vs `ADMIN_API_TOKEN`. Mirrors the
  `apps/form_builder_api` X-Admin-Token middleware (same header + env var) so
  the two apps behave alike.
- **`common/admin-token.decorator.ts`** — `@AdminToken()` wrapping
  `@UseGuards(AdminTokenGuard)`; applied at class level on both admin
  controllers (locks every endpoint, including the read-only status GET, per
  the agreed scope).
- **`config/env.validation.ts`** — `ADMIN_API_TOKEN` required when
  `NODE_ENV=production`, so the guard can't ship un-configured.
- Refreshed the stale "does NOT implement authentication" comments.

## Why it looks this way

- **Reused `isValidSecretToken` (common/secret-token.ts)** instead of writing a
  new comparison — it already does the SHA-256, fail-closed, timing-safe check
  used by the recipe-preview / smoke-submission / file-preview token gates. Less
  code, no new crypto to get wrong.
- **401 vs 403 split:** `isValidSecretToken` collapses "missing" and "wrong"
  into one `false`, so the guard adds an explicit missing-header check first to
  return 401 for "no token presented" and 403 for "token presented but wrong" —
  matching the form-builder middleware's semantics.
- **Prod-required / dev-passthrough:** an unset token throws 500 in production
  (belt-and-suspenders with the Joi boot check) but passes through elsewhere, so
  local dev and the existing test suite need no token configured.
- **Config read via ConfigService**, not `process.env` — matches how the other
  token gates in this app (submissions, form-definitions) read their secrets.

## Verification

- `nx run api:build` clean.
- `nx run api:test` — 879 pass, incl. the new guard spec (valid / wrong /
  missing / unset-dev / unset-prod) and two new env-validation tests. Adding the
  prod-required rule broke the existing "valid production env" CORS fixture
  (it lacked the new var); fixed by adding `ADMIN_API_TOKEN` to `baseEnv`. The
  one remaining failure is the DB-gated migration smoke test (needs a live
  Postgres), unrelated to this change.
