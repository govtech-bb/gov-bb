# Unify auth / dev-bypass and authenticate apps/api's admin endpoints

**Date:** 2026-06-30
**Branch:** `unify-auth-secure-api-admin-1406` → merges into `sandbox`
**Issue:** [#1406](https://github.com/govtech-bb/gov-bb/issues/1406) (ARCH-04, consolidation EPIC #1423); closes the gap left by closed #11

## What

Three coupled changes, ordered security-first:

- **(c)** New `AdminTokenGuard` (`apps/api/src/common/guards/admin-token.guard.ts`)
  validates `Authorization: Bearer <ARCHIVE_DRAFTS_TOKEN>` on the two previously
  **unauthenticated** admin controllers (kill switch + draft archive), applied
  via `@UseGuards`. New `apps/api/src/common/resolve-token-auth.ts` policy helper
  reuses the existing `isValidSecretToken`. `ARCHIVE_DRAFTS_TOKEN` added
  **optional** to `env.validation.ts`.
- **(b)** `apps/form_builder/app/server/publish.ts`'s inline `requireSession`
  deleted; `publishRecipe`/`eraseRecipe` switched to `.middleware([requireSession])`
  + `context.session`, matching `forms.ts`.
- **(a)** ADR 0061 records the three auth boundaries and the one dev-bypass
  policy; `apps/form_builder_api/src/middleware/auth.ts` refactored onto a
  deliberately-duplicated `resolveTokenAuth`, behaviour-preserving.

Specs added/updated across all three apps. ADR 0061 carries the decision.

## Why

ARCH-04 flagged three diverging auth models with an independently re-invented
dev-bypass, the worst part being that apps/api's `/admin/*` endpoints had **no
code-level auth at all** — only a Swagger-only `@ApiBearerAuth()` and "network
ACL" comments. The audit's recommendation was: secure apps/api, kill the
duplicate `requireSession` in `publish.ts`, and name the boundaries in an ADR.

Decisions that shaped the diff and won't survive in it:

- **Guard validates `ARCHIVE_DRAFTS_TOKEN`, not a new `ADMIN_API_TOKEN`.** The
  archive workflow's caller (`scripts/archive-merged-drafts.ts`) *already* sends
  `Authorization: Bearer ${ARCHIVE_DRAFTS_TOKEN}` — the controller just ignored
  it. Reusing that secret means zero workflow/GitHub-secret churn; the only
  deploy action is provisioning the var in apps/api's prod env. The alternative
  (renaming to `ADMIN_API_TOKEN` to match form_builder_api) needed the same
  provisioning *plus* a workflow + script + secret rename, for naming cosmetics.

- **Token read per-request from `process.env`, never a boot-required env var.**
  apps/api validates env at boot (ADR 0057); a `required` `ADMIN_API_TOKEN`
  there would crash-loop ECS on a missing value → circuit-breaker rollback (the
  exact prod failure mode seen before). The schema entry is `.optional()`; the
  guard fails closed in prod at request time instead.

- **`resolveTokenAuth` is duplicated, not shared via a package.** It's ~15 lines
  spanning a Nest app and an Express app. A shared buildable package would incur
  the nx "buildable + referenced" overhead and the `sherif` single-specifier
  gate for no real payoff. The duplication is governed by ADR 0061 + identical
  specs. apps/api's copy reuses the existing `isValidSecretToken`;
  form_builder_api's copy carries its own (byte-identical) compare.

- **The helper returns 4 states, not the plan's 3.** Added `misconfigured`
  alongside `ok | passthrough | denied` so a prod-misconfig maps to **500**
  (server error), distinct from `denied` → 401/403 (client error). This is what
  lets form_builder_api's refactor stay behaviour-preserving: its adapter keeps
  the 401-missing vs 403-mismatch split by inspecting `presented` itself, since
  `denied` collapses both.

- **The auth.ts compare swap is functionally equivalent.** The original used a
  raw `Buffer` compare with an `a.length !== b.length` short-circuit (a length
  side-channel); the new path compares SHA-256 digests via `isValidSecretToken`.
  Same true/false for equal/unequal tokens, same status codes — the timing-leak
  removal is a free security improvement, not a behaviour change.

- **`publish.ts`'s server fns now inherit the shared DEV-session fallback** (an
  intended side effect). In production `import.meta.env.DEV` is statically false,
  so the throw-on-no-session behaviour there is unchanged; locally they no longer
  require a real cookie.

## Notes

- **Spec gotcha encountered:** a `createServerFn` invoked directly under Vitest
  skips its `.middleware`, so `context.session` is `undefined`. `publish.spec.ts`
  had to pass `context: { session }` on every call (mirroring `forms.spec.ts`) —
  mocking `getSession` alone is not enough once the auth moved into middleware.
- **Shared credential, by design:** both admin surfaces (`/admin/drafts` and
  `/admin/form-definitions`) now gate on the same `ARCHIVE_DRAFTS_TOKEN`. The
  draft-archive endpoint has an automated caller; the kill switch is
  operator-invoked and now requires that token too.
- **Deploy prerequisite (not code):** apps/api sandbox and prod must both set
  `ARCHIVE_DRAFTS_TOKEN` (same value the workflow sends) or `/admin/*` returns
  500 (fail-closed). Documented in ADR 0061 and the guard comment.
- Verified this session: `api:test` (935 pass, 98.4% cov), `form-builder-app`
  (645), `form-builder-api` (244), `tsc -b` (exit 0),
  `nx run-many -t build --exclude=landing` (16 projects), and a clean
  adversarial code-review pass.

## Follow-up (2026-07-06 review pass)

A later review pass on this PR found four things worth fixing/recording
rather than re-litigating the original decisions above:

- **Deploy prerequisite corrected to sandbox-too.** The original "Deploy
  prerequisite" bullet above said prod only; `apps/api`'s Dockerfile actually
  sets `NODE_ENV=production` in its runner stage and `deploy-sandbox.yml`
  redeploys `apps/api` on every merge to `sandbox` (this PR's own merge
  target), so sandbox hits the fail-closed guard first, the moment this PR
  merges — not prod later. The archive workflow's calls fail silently
  (best-effort by design); the kill switch 500s overtly for operators. Fixed
  above and in ADR 0061.
- **`ADMIN_KILL_SWITCH_TOKEN` decouples the kill switch's credential from
  `ARCHIVE_DRAFTS_TOKEN`.** The kill-switch controller now constructs its
  guard as `new AdminTokenGuard("ADMIN_KILL_SWITCH_TOKEN", "ARCHIVE_DRAFTS_TOKEN")`
  (first-set-wins fallback); the draft-archive controller uses the zero-arg
  `new AdminTokenGuard()` (same `ARCHIVE_DRAFTS_TOKEN` default). Same
  value today, but while the dedicated var is unset, rotating
  `ARCHIVE_DRAFTS_TOKEN` (a CI credential with its own rotation cadence)
  silently rotates kill-switch access too — operators must be notified, or
  set `ADMIN_KILL_SWITCH_TOKEN` (`.optional()` in `env.validation.ts`, same as
  its sibling) to decouple them.
- **Comment-honesty fix on the CodeQL-driven `isValidSecretToken`/
  `extractBearerToken` changes — mechanisms kept, rationale corrected.**
  `isValidSecretToken` compares keyed HMAC-SHA256 digests (vs a bare SHA-256
  digest) purely to satisfy CodeQL's `js/insufficient-password-hash` alert;
  `timingSafeEqual` was already constant-time, so the keying adds no security
  over the plain digest compare. Likewise `extractBearerToken`'s linear
  scheme-test/slice/trim parse (vs a `/^Bearer\s+(.+)$/i` regex) is scanner
  compliance against `js/polynomial-redos`, not a load-bearing defence. Both
  functions' comments now say so explicitly; the mechanisms are unchanged.
- **New admin-controller guard-coverage tripwire spec.** `admin-controller-guard-coverage.spec.ts`
  scans the filesystem for `*.controller.ts` files without importing them,
  flags any whose `@Controller(...)` path starts with `admin`, and fails
  unless that file applies `AdminTokenGuard` inside a `@UseGuards(...)`
  decorator (an import or comment mention doesn't count) — so a future
  `admin/*` controller can't ship unauthenticated the way the original #11
  gap did.
- **Boot-crash caught and pinned: the guard must be applied as an instance.**
  The review's adversarial pass found that giving `AdminTokenGuard` a
  variadic constructor breaks the class-reference `@UseGuards(AdminTokenGuard)`
  form — Nest DI-instantiates class-referenced guards and cannot resolve the
  emitted constructor paramtype (`UnknownDependenciesException` at bootstrap →
  ECS crash-loop), while every unit spec stays green because none boots a Nest
  module. Both admin controllers now pass guard **instances**, and the new
  `admin-guards-boot.spec.ts` compiles the real controllers in a
  `Test.createTestingModule` so this class of break fails in CI, not at
  deploy.
