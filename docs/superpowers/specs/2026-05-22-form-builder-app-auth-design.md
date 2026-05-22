# `apps/form_builder` stopgap auth middleware — design

**Issue:** Replaces obsoleted PRs [#74](https://github.com/govtech-bb/gov-bb/pull/74) and [#97](https://github.com/govtech-bb/gov-bb/pull/97) following the monorepo restructure in [#86](https://github.com/govtech-bb/gov-bb/pull/86). Addresses the auth surface of [issue #12](https://github.com/govtech-bb/gov-bb/issues/12) re-mapped onto the new TanStack Start architecture.
**Severity:** Critical equivalent — the form-builder admin can plant arbitrary form definitions including SSRF-eligible `processors[]` configurations.
**Date:** 2026-05-22
**Branch:** `feat/form-builder-app-auth-stopgap` (off `dev`)

## Background — why this exists

PR #86 (`feat/dev-from-monorepo`) extracted the form-builder admin tool from the public `apps/forms` web app into a dedicated **TanStack Start** application at `apps/form_builder/`. The new app:

- Has its own embedded Node server (`node dist/server/server.js`).
- Talks directly to the database and the Anthropic/Bedrock LLM APIs via 19 **server functions** in `apps/form_builder/app/server/{ai-builder/sessions,forms,registry}.ts`.
- Has no auth — every server function is callable by any HTTP client that can reach the server.

The previous stopgap PRs targeted code that no longer exists:

- **PR #74** added `AdminTokenGuard` (NestJS `CanActivate`) on `FormBuilderController` in `apps/api`. The controller was deleted in #86; the AI/DB integration moved into `apps/form_builder/app/server/ai-builder/*`.
- **PR #97** added a TanStack Router `beforeLoad` gate on `/admin/form-builder` inside `apps/forms`. That route file was duplicated into a skeletal `apps/web/`, but the canonical home is now `apps/form_builder/app/routes/builder/*`, where the entire app is admin tooling.

Both PRs were closed as obsolete. The security concerns they addressed are real and unchanged; the implementation targets moved.

## Problem

Nineteen TanStack Start server functions in `apps/form_builder/app/server/` are anonymously reachable once the app is deployed:

- `sessions.ts`: `getAiStatus`, `createSession`, `sendMessage`, `getSession`, `getRecipe`, `extractRecipeFromSession`, `getSql`, `publishSession`, `deletePublished` (9)
- `forms.ts`: `listForms`, `getRecipe`, `submitRecipe`, `updateRecipe`, `nextVersion` (5)
- `registry.ts`: `getCatalogFn`, `getRegistryItemFn`, `getBuilderMetadata`, `validateRecipe`, `previewRecipe` (5)

`sendMessage` burns Anthropic/Bedrock tokens per call. `publishSession` writes to live `form_definitions` rows. `validateRecipe`/`previewRecipe` execute arbitrary recipe shapes. None of these should be reachable without authentication.

## Scope

**In scope** (single PR):

- New `apps/form_builder/app/server/auth/admin-token-middleware.ts` exporting a `requireAdminToken` middleware built with `createMiddleware({ type: "function" }).server(...)` from `@tanstack/react-start`.
- New `apps/form_builder/app/server/env.ts` validating `ADMIN_API_TOKEN` at startup. Required (`min(32)`) when `NODE_ENV=production`; optional otherwise.
- Apply `.middleware([requireAdminToken])` to all 19 server functions in `sessions.ts`, `forms.ts`, `registry.ts`.
- Unit tests for the middleware (5 cases).

**Explicitly out of scope:**

- **Deployment topology.** Where the app deploys, what subdomain it serves, whether Cloudflare Access / AWS WAF / an internal-only ingress fronts it — these decisions need infra context not visible in this repo. Tracked as a follow-up.
- **Frontend client wiring.** The middleware enforces server-side only. In production, the assumption is that a reverse proxy adds the `X-Admin-Token` header to authorized requests (e.g., Cloudflare Access with a workers script, or AWS WAF + ALB). In dev, the env var is unset and the middleware passes through; the UI works normally without modification.
- **JWT / cookies / sessions.** Static token only. Real per-user auth is issue #11's job.
- **Full env validation.** Only `ADMIN_API_TOKEN` is validated in this PR. Other env vars (`DB_*`, `ANTHROPIC_API_KEY`, `AI_PROVIDER`, etc.) are left unvalidated; a fuller validation file is a future cleanup.
- **Per-route exemptions / `@Public()` equivalent.** All 19 server functions are protected, including read-only ones like `getAiStatus`. Matches PR #74's class-level guard intent.
- **The SSRF / processors[] concerns** (issue #12 links 3 & 4). The relevant code (`OpencrvsProcessor`, `publishSession`) moved during the restructure; tracking and addressing them in their new home is its own work.

## Architecture

### New: `apps/form_builder/app/server/auth/admin-token-middleware.ts`

```ts
import { createMiddleware } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import { timingSafeEqual } from "node:crypto";

export const ADMIN_TOKEN_HEADER = "x-admin-token";

export const requireAdminToken = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const expected = process.env.ADMIN_API_TOKEN;
    if (!expected) {
      // Dev passthrough: env var unset means no auth enforced.
      // env.ts ensures this cannot happen in production.
      return next();
    }

    const request = getWebRequest();
    const presented = request.headers.get(ADMIN_TOKEN_HEADER);
    if (!presented) {
      throw new Error("Missing X-Admin-Token header");
    }

    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Invalid admin token");
    }

    return next();
  },
);
```

**Fail-open-in-dev rationale:** the form-builder UI calls these server functions on every page interaction. Requiring a header for local dev would mean every action in `pnpm dev` returns an auth error, making the app unusable. The dev experience matches "no env var → no auth" (deliberate); production safety comes from Joi making the env var required at boot time.

**Length-check before `timingSafeEqual`:** Node's `timingSafeEqual` throws `RangeError` on length mismatch. The length comparison itself only leaks the length of the configured token, which is a fixed value chosen by the operator and not a secret.

**Error shape:** thrown `Error` objects propagate to the client as TanStack Start's default 500-ish error response. We don't differentiate 401 from 503 from 400 because TanStack Start doesn't ship an `HttpException` equivalent and we want a stopgap, not a UX-polished error contract. The client sees "request failed" — adequate for an admin tool reachable by humans, not a public API.

### New: `apps/form_builder/app/server/env.ts`

```ts
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const schema = z.object({
  ADMIN_API_TOKEN: isProd
    ? z.string().min(32)
    : z.string().min(32).optional(),
});

export const env = schema.parse(process.env);
```

Imported at server startup (e.g., via a side-effect import in the entry point). Throws on boot when `NODE_ENV=production` and `ADMIN_API_TOKEN` is missing or shorter than 32 characters. Recommended generation: `openssl rand -hex 32` (64 hex chars, clears the 32-char floor).

The form_builder app currently has no env validation file at all. This adds the smallest possible one — validates only the new variable. Other env vars (`DB_*`, `ANTHROPIC_API_KEY`, etc.) consumed elsewhere remain unvalidated; a comprehensive validation file would be a follow-up.

### Modified: `apps/form_builder/app/server/ai-builder/sessions.ts`

Add to the top of the file:

```ts
import { requireAdminToken } from "../auth/admin-token-middleware";
```

Then chain `.middleware([requireAdminToken])` into every `createServerFn(...)` call. Example pattern applied 9 times in this file:

```ts
// before
export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator(z.object({ ... }))
  .handler(async ({ data }) => { ... });

// after
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireAdminToken])
  .inputValidator(z.object({ ... }))
  .handler(async ({ data }) => { ... });
```

The middleware chains before the input validator so unauthenticated requests don't even reach Zod parsing.

### Modified: `apps/form_builder/app/server/forms.ts` and `registry.ts`

Same shape — import the middleware, chain `.middleware([requireAdminToken])` into every `createServerFn(...)` call. 5 functions each = 10 additional applications.

### Tests

`apps/form_builder/app/server/auth/admin-token-middleware.spec.ts` exercises the middleware in isolation by calling it with a mocked `next` function and a mocked request:

| Case | Setup | Expectation |
|---|---|---|
| Passthrough when env unset | `delete process.env.ADMIN_API_TOKEN`; any header | Calls `next()` once; returns `next`'s value |
| Allows valid token | env set to 32-char string; matching header | Calls `next()` once |
| Rejects missing header | env set; no header | Throws |
| Rejects wrong length | env set to 32 chars; 31-char header | Throws |
| Rejects wrong content | env set; same-length but different content | Throws |

`getWebRequest()` is mocked via Jest's module mocking. The test does NOT exercise actual server function chaining — that's mechanical wiring covered by the smoke test.

## Local verification (before push)

```bash
# 1. Dev mode with no token → UI works normally
unset ADMIN_API_TOKEN  # (or comment out in apps/form_builder/.env)
pnpm --filter form-builder-app run dev

# Visit http://localhost:3001/builder/ai → page loads, AI status works.
# Expected: all server functions pass through.

# 2. Dev mode with token set → header required
export ADMIN_API_TOKEN=$(openssl rand -hex 32)
# Restart dev server.
# Visit /builder/ai → server functions fail (UI breaks). Expected.

# 3. With curl + header → server functions succeed
curl -X POST http://localhost:3001/_serverFn/createSession \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  -d '{"data":{}}'
# Expected: 200 with session JSON.

# 4. With curl + wrong header → fails
curl -X POST http://localhost:3001/_serverFn/createSession \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: wrong-token-wrong-token-wrong-token" \
  -d '{"data":{}}'
# Expected: 500-ish error response with "Invalid admin token" message.

# 5. Production-mode startup without token → boot fails
NODE_ENV=production pnpm --filter form-builder-app run start
# Expected: Zod error "ADMIN_API_TOKEN is required" before server listens.
```

Tests 1 + 5 are the critical pair: 1 proves dev is wide-open, 5 proves prod is fail-closed at boot.

## What this PR does not change

- The form-builder UI's existing call sites (server functions are still called the same way; client code is unmodified).
- Database access, AI integration, or any business logic.
- The 19 server functions' input validation, response shapes, or error semantics (other than now possibly throwing an auth error before reaching the handler).
- The `apps/api` codebase (no longer related to form-builder).
- Any infra config — deployment topology is a separate decision.

## Dependencies

None new. `@tanstack/react-start`, `zod`, and Node's `crypto` are already in scope.

## Rollout

Single PR against `dev`. No migration. No feature flag.

**Operator action required before production deploy:** generate a token (`openssl rand -hex 32`), set `ADMIN_API_TOKEN` in the deploy environment. Without it, server startup will fail Zod validation.

**Network-layer assumption:** the production deployment uses a reverse proxy or access gateway that adds the `X-Admin-Token` header on authorized requests. Without that (or some other client-side header injection), the UI is unusable in production — which is the intended state until issue #11 lands real auth or a deployment-topology PR adds a network-layer solution.

Worst-case rollback: a single revert commit. The middleware is purely additive; reverting restores anonymous access. If something breaks (e.g., `getWebRequest()` behaves differently than expected and the middleware throws in dev when env is unset), the symptom is "UI is broken in dev too" — caught immediately by local verification step 1 and fixed by reverting.

## Open question (for follow-up, not this PR)

Where does `apps/form_builder` deploy, and what fronts it? Three plausible answers and the auth model each implies:

1. **Local-dev only (Docker on a developer's machine):** middleware unnecessary; just don't deploy. Closes #12 by *not existing in production*.
2. **Private subdomain behind Cloudflare Access / AWS WAF:** middleware is defense in depth. The proxy adds the token on authenticated requests; admins log in via SSO at the proxy.
3. **Public subdomain with app-level auth as the only gate:** middleware is the primary defense. Operators must manage the static token carefully (rotate, distribute, etc.). Stopgap until #11.

The deployment topology PR — separately tracked — picks one of these. This PR works under all three.
