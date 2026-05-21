# Form-builder AdminTokenGuard stopgap — design

**Issue:** [#12 — Unauthenticated form-builder admin → SSRF/data-exfil chain](https://github.com/govtech-bb/gov-bb/issues/12), link 1 of 4
**Severity:** Critical (issue body) — link 1 alone retires the anonymous-attacker vector that motivates the chain
**Date:** 2026-05-21
**Branch:** `fix/form-builder-admin-token-guard` (off `dev`)

## Problem

`apps/api/src/form-builder/form-builder.controller.ts` is anonymously reachable. `@SkipThrottle()` at the class level exempts every route from the global `ThrottlerGuard`, and no `@UseGuards()` is applied. Combined with the world-accessible `/admin/form-builder` route in `apps/forms/src/routes/admin/form-builder.tsx`, the entire form-builder API is reachable from the public internet at zero rate-limit and zero authentication — the gateway link in the 4-link exploit chain described in issue #12.

Previous work in PR #49 closed the "any binary forwarded to Anthropic" hole on the upload route via `pdfFileFilter` and `isPdfBuffer`. That defensive validation is necessary but not sufficient: even with PDF validation in place, the endpoint remains anonymously reachable and can still publish malicious form definitions (the exfil link in the chain).

## Scope

This PR is link 1 of the 4-link stopgap in issue #12:

1. **Add `AdminTokenGuard` on `FormBuilderController` + remove `@SkipThrottle()`** ← this PR
2. Disable the `/admin/form-builder` route component in production (next PR)
3. URL allowlist + scheme check in `OpencrvsProcessor` (subsequent PR)
4. Validate the `processors[]` shape in `publish()` with Zod or class-validator (subsequent PR)

Long-term, this guard is replaced by the real auth solution from issue #11. This is a stopgap, not the destination.

**In scope for this PR:**

- `AdminTokenGuard` class implementing `CanActivate`, reading `ADMIN_API_TOKEN` via `ConfigService`, comparing against the `X-Admin-Token` header with `crypto.timingSafeEqual`.
- `@UseGuards(AdminTokenGuard)` at the class level on `FormBuilderController`; `@SkipThrottle()` removed.
- `@Throttle({ medium: { ttl: 60_000, limit: 10 }, long: { ttl: 3_600_000, limit: 100 } })` on `sendMessage` only, to cap LLM cost even from an authenticated caller.
- `ADMIN_API_TOKEN` added to the Joi env schema as conditionally-required: `Joi.required()` in production, `Joi.optional()` in dev. Minimum length 32 characters.
- Unit tests for the guard (5 cases).

**Explicitly out of scope:**

- Any change to the `apps/forms/src/routes/admin/form-builder.tsx` frontend. The admin UI will return 401 on every call until link 2 lands; this is acceptable because the UI was always insecure and link 2 disables the route in production anyway.
- A `@Public()` decorator for opting individual routes *out* of the guard. The class-level `@UseGuards()` protects every route including `GET /form-builder/status`. If `/status` needs to become public later, that's a one-line follow-up.
- Replacing `ThrottlerGuard` as the global `APP_GUARD`. The new guard is registered as a per-module provider, not a global guard. When #11 lands a real auth pattern, it becomes the global guard and this stopgap is deleted.

## Architecture

### New: `apps/api/src/form-builder/admin-token.guard.ts`

```ts
import {
  CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";
import type { Request } from "express";

export const ADMIN_TOKEN_HEADER = "x-admin-token";

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>("ADMIN_API_TOKEN");
    if (!expected) {
      throw new HttpException(
        "Admin endpoint is disabled (ADMIN_API_TOKEN not configured)",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const presented = req.header(ADMIN_TOKEN_HEADER);
    if (!presented) {
      throw new HttpException(
        "Missing X-Admin-Token header",
        HttpStatus.UNAUTHORIZED,
      );
    }

    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new HttpException("Invalid admin token", HttpStatus.UNAUTHORIZED);
    }

    return true;
  }
}
```

Three rejection paths, three distinct semantic states:

- **503 Service Unavailable** when `ADMIN_API_TOKEN` is not set in the environment. Loud and specific — this is operator misconfiguration, not an auth failure. In production this never happens because Joi `.required()` halts startup; in dev it surfaces the configuration problem instead of silently allowing the request.
- **401 Unauthorized** when the `X-Admin-Token` header is missing.
- **401 Unauthorized** when the token is presented but does not match. Wrong-length and wrong-content cases collapse to the same response, preventing length-leakage between collision attempts.

The length check before `timingSafeEqual` is required by Node's API — it throws `RangeError` if the two buffers differ in length. The length check itself only leaks the length of the configured token, which is fixed and not a secret.

### Modified: `apps/api/src/form-builder/form-builder.module.ts`

Add `AdminTokenGuard` to `providers`. It's a per-module provider, not a global `APP_GUARD`. This means the guard is only constructable inside the form-builder DI scope, which is the correct boundary for a stopgap that's slated for deletion.

### Modified: `apps/api/src/form-builder/form-builder.controller.ts`

Three decorator-level changes:

- Drop `import { SkipThrottle } from "@nestjs/throttler";` and the `@SkipThrottle()` class decorator.
- Add `import { Throttle } from "@nestjs/throttler";`, `import { UseGuards } from "@nestjs/common";`, `import { AdminTokenGuard } from "./admin-token.guard";`.
- Add `@UseGuards(AdminTokenGuard)` at the class level.
- Add `@Throttle({ medium: { ttl: 60_000, limit: 10 }, long: { ttl: 3_600_000, limit: 100 } })` on `sendMessage` only — tighter than the global `medium: 60/min, long: 1000/hour`. The `short: 5/10s` bucket is inherited from the global config, not overridden. Other routes (`status`, `getRecipe`, `getSql`, `extractRecipe`, `publish`, `deletePublished`, `createSession`, `getSession`) inherit the global limits unchanged.

No change to handler bodies. Guards run before interceptors, so an unauthenticated request never reaches `FileInterceptor` (saves the cost of buffering the upload before rejecting it).

### Modified: `apps/api/src/config/env.validation.ts`

Inside the Joi schema, alongside the existing AI / Form Builder block:

```ts
  // Form-builder admin token (stopgap until #11 lands real auth).
  // Required in production; optional in dev (but the guard always runs —
  // an unset token returns 503, never silently allows the request).
  ADMIN_API_TOKEN: Joi.alternatives().conditional("NODE_ENV", {
    is: "production",
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().min(32).optional().allow(""),
  }),
```

`.min(32)` enforces 32 characters minimum in either branch. Recommended generation: `openssl rand -hex 32` (64 hex characters). The minimum-of-32 floor is below the recommended length so operators have flexibility but cannot set a trivially-short token.

The `Joi.alternatives().conditional()` form matches the precedent set by `CORS_ORIGIN` in the same file — both branches are spelled out explicitly, removing any ambiguity about schema-rule merging. The conditional-required pattern also appears at `EZPAY_WEBHOOK_SECRET` (required when `EZPAY_WEBHOOK_VERIFY_SIGNATURE=true`) and `SQS_QUEUE_URL` (required when `SQS_ENABLED=true`).

## Error responses

| Condition | Status | Body |
|---|---|---|
| Valid request with correct token | (per-handler) | (per-handler) |
| `ADMIN_API_TOKEN` unset, any request | 503 | `{ statusCode: 503, message: "Admin endpoint is disabled (ADMIN_API_TOKEN not configured)" }` |
| No `X-Admin-Token` header | 401 | `{ statusCode: 401, message: "Missing X-Admin-Token header" }` |
| Token presented but wrong length or wrong content | 401 | `{ statusCode: 401, message: "Invalid admin token" }` |
| Authenticated, but >10 messages in 60s on `sendMessage` | 429 | Standard `ThrottlerException` response |
| Authenticated, but >100 messages in 1 hour on `sendMessage` | 429 | Standard `ThrottlerException` response |

## Tests

### `apps/api/src/form-builder/admin-token.guard.spec.ts` (new)

Pure unit tests. Pattern follows `payment-webhook.controller.spec.ts`: instantiate the guard directly with a fake `ConfigService`.

- Throws 503 when `ADMIN_API_TOKEN` is not configured (regardless of header presence).
- Throws 401 when the `X-Admin-Token` header is missing.
- Throws 401 when the token is the wrong length.
- Throws 401 when the token is the right length but wrong content.
- Returns `true` when the token matches exactly.

5 cases cover every branch of the guard.

The existing `apps/api/src/form-builder/form-builder.controller.spec.ts` does not need to change — it tests handler logic by calling the controller method directly, which bypasses the guard. The guard's behavior at HTTP layer is verified by the smoke test.

## Local verification (before push)

```bash
# Generate a token and put it in the dev env
TOKEN=$(openssl rand -hex 32)
echo "ADMIN_API_TOKEN=$TOKEN" >> apps/api/.env

# Restart dev
pnpm --filter api run start:dev

# (1) No header                                    → expect 401
curl -i -X GET http://localhost:3001/form-builder/status

# (2) Wrong token                                  → expect 401
curl -i -X GET http://localhost:3001/form-builder/status \
  -H "X-Admin-Token: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

# (3) Right token                                  → expect 200 (or 503 if AI subsystem not configured)
curl -i -X GET http://localhost:3001/form-builder/status \
  -H "X-Admin-Token: $TOKEN"

# (4) Throttle: 11 rapid sendMessage calls         → 10 handler responses then 429
SESSION=$(curl -s -X POST http://localhost:3001/form-builder/sessions \
  -H "Content-Type: application/json" -H "X-Admin-Token: $TOKEN" -d '{}' \
  | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).sessionId))')
for i in {1..11}; do
  printf "Request %d: " "$i"
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "http://localhost:3001/form-builder/sessions/$SESSION/messages" \
    -H "X-Admin-Token: $TOKEN" -F "message=test$i"
done

# (5) Unset token, restart, any request            → expect 503
# Comment out ADMIN_API_TOKEN in apps/api/.env, restart, then:
curl -i -X GET http://localhost:3001/form-builder/status \
  -H "X-Admin-Token: $TOKEN"

# Cleanup
sed -i.bak '/ADMIN_API_TOKEN=/d' apps/api/.env && rm -f apps/api/.env.bak
```

Test (4) is the only proof that `@Throttle()` on a per-route bucket override actually takes effect — NestJS's throttler can be subtle about method-vs-class decorator interaction. Test (5) is the most security-critical: it confirms that an unset env var fails closed (503), not open.

## What this PR does not change

- The 4-link `OpencrvsProcessor` chain in issue #12 — links 2, 3, 4 are separate PRs.
- Authentication scheme (replaced wholesale by #11).
- Cost caps from PR #49's deferred resolution #5 — effectively retired by this PR, since the anonymous-attacker scenario is closed.
- The frontend `/admin/form-builder` page — will 401 on every call until link 2 disables it in production.
- The `GlobalExceptionFilter` 413→500 collapse and the `app.use(express.json)` rawBody shadowing surfaced during the PR #49 smoke test. Tracked separately.

## Dependencies

None. `crypto.timingSafeEqual` is a Node core API. `@nestjs/config` and `@nestjs/throttler` are already in the project.

## Rollout

Single PR against `dev`. No migration. No feature flag.

**Operator action required before deploy to sandbox/production:** generate a token (`openssl rand -hex 32`), set `ADMIN_API_TOKEN` in the deploy environment, and communicate the token to anyone who needs to use the form-builder admin endpoints (curl/Postman during the stopgap window). Without this, production startup will fail Joi validation.

**Developer action required after pull:** add `ADMIN_API_TOKEN=<any 32+ char string>` to `apps/api/.env`. The guard always runs in dev — if the var is unset, every form-builder call returns 503 with `"Admin endpoint is disabled (ADMIN_API_TOKEN not configured)"`. This is intentional (fail-closed) but worth a heads-up in the PR description so reviewers don't think the test environment is broken.

Worst-case rollback: single revert commit. The change is purely additive in terms of behavior (the guard rejects requests that the API previously accepted; legitimate callers gain access by setting the header).
