# api_v2: the site routes are rate-limited per client, and the ALB is trusted by address range (#3129)

## Context

api_v2 had no limiter and no `trustProxy`, so every caller behind the ALB looked like the ALB, and a client could put anything in `X-Forwarded-For`. #3129 asked for a per-client limit on the public site routes that a client cannot dodge by spoofing that header. The sibling plans #3125 and #3127 make landing's server the main caller of those routes, and all of landing's traffic arrives from Amplify's egress addresses.

## What we did

- `trustProxy: "uniquelocal"` in `apps/api_v2/src/app.ts`.
- `@fastify/rate-limit` registered at the top of `siteRoutes` (`apps/api_v2/src/routes/site.ts`): 1,000 requests/min per `request.ip`, in memory.
- Landing is exempt by a shared secret: api_v2's optional `LANDING_SECRET`, which landing's server sends as `x-landing-token` on its `/pages` and `/categories…` reads (`apps/landing/src/lib/api-v2-page.ts`, `api-v2-categories.ts`; build-baked into Nitro's server-only `runtimeConfig` and added to `check-no-secret-leak.mjs`). The rate limiter's `allowList` compares it in constant time, with the same hash-then-`timingSafeEqual` helper as the preview token. Unset, nobody is exempt.
- `apps/api_v2/src/rate-limit.test.ts`: tier and scope, keying on the forwarded client, spoofed and untrusted-peer headers ignored, the 1,001st request is a 429 in the API's own error shape, and landing's token skips the limit (no `x-ratelimit-*` headers) while a wrong, missing or unconfigured one does not.

## Why we did it that way

- **Trust is an address range, not a hop count.** Fastify 5.12.1+ makes a numeric `trustProxy` trust nothing (GHSA-3m5p-2c4r-xxw2). `uniquelocal` (RFC 1918 + fc00::/7) matches the ALB's in-VPC peers and nothing on the public internet. `loopback` is left out on purpose, so `app.inject` and local dev read the socket address and ignore the header. We kept it a constant rather than an env var, because alpha-infra's tofu owns the task env and a code change auto-deploys to sandbox faster. If anything (CloudFront, for example) is ever put in front of the ALB, its ranges have to be added here, or `request.ip` becomes the edge.
- **One tier of 1,000/min, not the issue's stricter tier on `/catalog` and `/search/documents`.** Landing shares one or a few addresses, and since #3127 a 429 opens its circuit breaker for 30 s (static content for every page on that instance). A tier strict enough to slow a direct caller would cap landing. The cost is that this is a backstop against direct callers, not real per-citizen protection. Per-citizen protection belongs at landing's edge or a WAF.
- **Landing is exempt by a shared secret, not by sizing (sajclarke's review).** The first version sized 1,000 above landing's cached reads (about 2/min/instance). But landing calls `/pages` on every page view with no cache, and bots probing unknown URLs get past any cache landing could add, so landing's rate from one egress address follows citizen and bot traffic, not anything the limit can be sized against. One 429 opens landing's breaker for 30 s and api_v2-only pages then 404. A shared secret in `allowList` takes landing out of the question; the limit now only applies to direct callers.
- **Scoped by encapsulation, not `global: true` plus opt-outs.** Registering inside `siteRoutes` leaves editor, `/api/auth/*` (BetterAuth has its own limiter), `/docs/*` (the ALB health check) and the future `/health` unlimited by construction. When #3351 lands, it moves the category routes into a child plugin registered inside `siteRoutes`, so they stay covered.
- **No new 429 handler.** The plugin throws `statusCode: 429`, and the existing error handler already renders `{ error: "too_many_requests", message }`.

## What we almost got wrong

- `pnpm --filter … add` re-resolved unrelated lockfile entries (TanStack, zod peers: about 185 lines). Editing `package.json` by hand and running `pnpm install` gave a 26/7 diff.
- `editor_v2:build` fails on clean `v2-rewrite` (`@tanstack/router-core` has no export `_getRenderedMatches`). This change didn't cause it.

## Open questions

- Whether a WAF rate rule covers api_v2's ALB (ask in #3162).
- The 1,000 figure has no traffic data behind it yet; it now only bounds direct callers.
- `LANDING_SECRET` must be set in alpha-infra (the api_v2 task definition) and in landing's Amplify environment, to the same value, before landing points at api_v2.
- BetterAuth's `trustedProxies` is left unset. A client-added XFF entry puts it in a shared, stricter bucket, which is not a bypass.
