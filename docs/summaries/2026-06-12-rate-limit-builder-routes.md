# Rate-limit `form_builder_api` `/builder/*` routes — Implementation Session

**Date:** 2026-06-12
**Branch:** `worktree-rate-limit-builder-routes`
**Issue:** [#930](https://github.com/govtech-bb/gov-bb/issues/930)

## Context

CodeQL (`js/missing-rate-limiting`, high) flagged that `form_builder_api`'s
authenticated route handlers — clearest case `POST /builder/publish`, which
accepts a GitHub token, reads the DB, and opens PRs — had no rate limit
(alerts #6 and #9, both on `publishHandler`). Pre-existing debt surfaced by
#926's handler refactor; the route had never had a limiter, only
`authMiddleware`. Going in, all app wiring lived inline in `main.ts`, which
also made the app untestable via supertest.

## What we did

- Extracted all Express wiring out of `main.ts` into a new exported
  `src/app.ts`; `main.ts` is now a thin listen-only entrypoint.
- Added a generous global `builderLimiter` (`express-rate-limit` v8, 120/min,
  overridable via `BUILDER_RATE_LIMIT`) on the `/builder` mount, **before**
  `authMiddleware`. `/builder/health` stays unlimited (registered first).
- Added `src/app.spec.ts` (supertest, TDD): asserts a `429` once the
  per-window limit is exceeded.
- Commit `799550a4`.

## Why we did it that way

- **Global limiter, before auth — not a publish-specific cap.** Discussed in
  the plan and rejected the tighter alternatives (publish-only / write-only
  limits). The simplest thing that clears the alerts and matches the existing
  `apps/api` global-throttler precedent won. Mounting *before* `authMiddleware`
  does double duty: it caps unauthenticated admin-token guessing, and it puts
  the limiter unambiguously on the path to `publishHandler` so CodeQL clears
  both alerts. `/builder/health` is registered before the mount so it stays
  unlimited.
- **Per-process in-memory store, no `trust proxy`.** Deliberately mirrors
  `apps/api`'s posture: each Fargate task owns its own counters, the real
  per-IP protection is the AWS WAF rate-based rule, and this limiter is
  defense-in-depth. Per-IP keying buys little here because `/builder` sits
  behind a single shared admin token — there's no per-user identity to key on.
  Redis/shared store left out of scope with the same "switch if horizontal
  scaling makes it material" note `apps/api` carries.
- **Test sets env then dynamically imports `app`.** The limiter reads
  `BUILDER_RATE_LIMIT` at module-load time; a static top-level import would
  hoist above the env setup and lock in the default 120. So the spec sets a low
  limit + `ADMIN_API_TOKEN`, then `await import("./app")`. It fires header-less
  requests so under-limit ones return `401` from auth (no DB/GitHub work) while
  still passing through the limiter ahead of auth — keeping the test DB-free
  and deterministic.

## What we almost got wrong

The build broke on a `tsc` overload error (`RateLimitRequestHandler` not
assignable to `app.use`) that the jest run had sailed past — `ts-jest` runs
with `isolatedModules`, so it transpiles without type-checking. Root cause was
**not** our code: `express-rate-limit`'s bundled `.d.ts` resolves the
workspace-**hoisted** `@types/express@4` (pulled by another package), so its
handler is typed against Express 4's `RequestHandler`, while this app is on
Express 5 (its own `@types/express@5.0.6`). Two `RequestHandler` identities,
not assignable. The limiter is a valid Express 5 handler at runtime — the
mismatch is purely types — so we re-assert the app's own `RequestHandler` via
a documented cast rather than touching the workspace-wide `@types/express`
resolution (too broad a change for a types-only artifact). Lesson logged: a
green `ts-jest` run does not mean `tsc` is green; run the build, not just the
test.

## Open questions

None blocking. If 120/min ever proves tight, retune via `BUILDER_RATE_LIMIT`
(no code change) rather than widening in code.
