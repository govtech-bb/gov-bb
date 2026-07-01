# 0061 — Three auth boundaries, one dev-bypass policy

**Date:** 2026-06-30
**Status:** Accepted
**Issue:** [#1406](https://github.com/govtech-bb/gov-bb/issues/1406) (ARCH-04, consolidation EPIC [#1423](https://github.com/govtech-bb/gov-bb/issues/1423)); closes the gap left by [#11](https://github.com/govtech-bb/gov-bb/issues/11)

## Context

The platform authenticates three different kinds of caller, and each had
independently re-invented the same "bypass auth in dev" decision — with one
boundary having no code-level auth at all:

| Surface | Caller | Mechanism |
|---|---|---|
| `form_builder` browser server-fns | A signed-in builder user | AES-GCM GitHub-OAuth **cookie** session (`require-session.ts`), synthesising a `{login:'dev'}` session in DEV |
| `form_builder_api /builder/*` | The builder's SSR backend (service-to-service) | timing-safe **X-Admin-Token** middleware (`middleware/auth.ts`), dev-passthrough when `ADMIN_API_TOKEN` unset |
| `apps/api /admin/*` | The `archive-merged-drafts` workflow + VPC operators | **nothing** — a Swagger-only `@ApiBearerAuth()`, "network ACL" comments, and no guard |

These are deliberately different boundaries — a browser cookie, a service
token, and (now) a service token — not an accident to be collapsed into one
mechanism. But three problems followed from them being un-named and the
dev-bypass being copy-pasted:

1. **`apps/api`'s `/admin/*` endpoints (the per-form kill switch and
   draft-archive) shipped unauthenticated.** Protection was network-ACL only;
   the `@ApiBearerAuth()` was Swagger documentation, not enforcement. This is
   the live security gap [#11](https://github.com/govtech-bb/gov-bb/issues/11)
   named but never fixed.
2. **`publish.ts` had a third, inline `requireSession`** on the privileged
   PR-writing path, diverging from the shared `require-session` middleware (no
   DEV fallback, separate code to drift).
3. **The dev-bypass decision was re-implemented per service**, so each copy
   could independently regress into production if `NODE_ENV` / `import.meta.env.DEV`
   were not statically false.

## Decision

**The three boundaries are deliberate and stay distinct. The dev-bypass +
token-match *decision* is named once and implemented identically on each
service-token boundary.**

- **`apps/api /admin/*` is now authenticated** by `AdminTokenGuard`
  (`common/guards/admin-token.guard.ts`), applied with `@UseGuards` on the
  kill-switch and draft-archive controllers only — the public
  forms/submissions/files endpoints stay open. It validates
  `Authorization: Bearer <token>` against **`ARCHIVE_DRAFTS_TOKEN`** (the secret
  the archive workflow already sends), reusing the existing timing-safe
  `isValidSecretToken`.

- **`publish.ts`'s inline `requireSession` is deleted.** `publishRecipe` and
  `eraseRecipe` use `.middleware([requireSession])` and read `context.session`,
  matching every other browser server-fn in `forms.ts`.

- **One dev-bypass policy, `resolveTokenAuth({ presented, expected, isProd })`**,
  returns `ok | passthrough | denied | misconfigured`:
  - no secret + production → `misconfigured` (fail closed),
  - no secret + non-prod → `passthrough` (dev bypass),
  - secret set + matches → `ok`,
  - secret set + absent/wrong → `denied`.

  Header extraction and HTTP-status mapping stay in each adapter (the Nest guard
  maps `denied` → 401; the Express middleware keeps its 401-missing /
  403-mismatch split). The browser-cookie boundary keeps its own DEV
  synthesised-session fallback — it is not a token boundary and is out of scope
  for `resolveTokenAuth`.

- **The token must be read per-request, never as a boot-required env var.**
  `ARCHIVE_DRAFTS_TOKEN` is `optional` in `apps/api`'s Zod schema; the guard
  reads `process.env` at request time and fails closed in prod. A
  boot-`required` var would crash-loop ECS on a missing value → circuit-breaker
  rollback (see ADR 0057 and the prod-env incidents it cites).

- **`resolveTokenAuth` is deliberately duplicated**, not shared via a workspace
  package. It lives in `apps/api/src/common/resolve-token-auth.ts` and
  `apps/form_builder_api/src/middleware/resolve-token-auth.ts`. Both are ~15
  lines, pinned by identical specs. A shared buildable package would add the nx
  "buildable + referenced" overhead and the `sherif` single-specifier gate for
  no real payoff at this size. The duplication is the governed cost of this ADR.

## Consequences

- **`apps/api` prod must provision `ARCHIVE_DRAFTS_TOKEN`** (the same value the
  `archive-merged-drafts` workflow sends) alongside this change. Until it is
  set, the guard fails closed in production: `/admin/*` returns 500 and the
  archive workflow's best-effort calls are rejected. No new GitHub secret or
  workflow change is needed — the caller already sends the Bearer token.
- **A new service-token boundary uses `resolveTokenAuth`**; it does not invent a
  fourth dev-bypass. A reviewer should push back on a hand-rolled `NODE_ENV`
  check that gates auth.
- **The two `resolveTokenAuth` copies must stay in sync.** Their specs mirror
  each other; changing the decision table means changing both.
- **`publishRecipe` / `eraseRecipe` now inherit the shared DEV session
  fallback.** In production `import.meta.env.DEV` is statically false, so the
  behaviour there is unchanged; in local dev they no longer require a real
  session cookie.
- **The network ACL stays** as defence in depth on `/admin/*`; the guard is the
  primary control, not a replacement for it.
