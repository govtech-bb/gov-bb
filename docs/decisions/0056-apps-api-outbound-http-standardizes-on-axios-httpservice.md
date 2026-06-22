# 0056 — apps/api outbound HTTP standardizes on axios HttpService

**Date:** 2026-06-22
**Status:** Accepted
**Issue:** [#1421](https://github.com/govtech-bb/gov-bb/issues/1421) (TECH-04)

## Context

`apps/api`'s outbound integration layer used two HTTP stacks with no shared
client/timeout/error abstraction:

- `EzpayClient` and `YouthOpportunityWebhookService` already used `@nestjs/axios`
  `HttpService` (`firstValueFrom(this.http.post(..., { timeout, headers }))`).
- `WebhookProcessor` and `OpencrvsProcessor` used native `fetch` with a
  hand-rolled `AbortController` timeout and a `!response.ok` throw. The
  `X-Idempotency-Key` `${submissionId}:${index}` construction and the non-2xx
  throw were copy-pasted between the two.

Two mocking strategies (axios-mock vs `global.fetch`), timeout/error-mapping
reimplemented per integration, and no single place to add a retry policy or
circuit-breaker.

The issue recommended consolidating on **native fetch** (lighter, DI-free). We
chose the opposite: **axios via `@nestjs/axios` `HttpService`** — for NestJS DI
(constructor-injectable, mockable in unit tests without patching globals) and
because a single injectable client is the natural seam to later add
interceptors, retries, and a breaker in one place.

## Decision

**All `apps/api` outbound HTTP goes through `@nestjs/axios` `HttpService`, via
the shared `timedPost` helper in
`apps/api/src/forms/submissions/processors/http-post.ts`. Native `fetch` is not
used for outbound calls.**

- `timedPost(http, url, body, { headers, timeoutMs, method? })` issues
  `http.request({ method, url, data, headers, timeout, validateStatus })`,
  sending `body` verbatim (callers pre-serialize so an HMAC signature is
  computed over the exact bytes sent). It defaults to `POST`; the generic
  webhook processor passes its configurable verb.
- `validateStatus: () => true` makes axios resolve on any status so the helper
  maps non-2xx to a typed `HttpPostError` (carrying `url` + `status`) itself,
  instead of axios throwing its own less-specific error.
- `idempotencyKey(submissionId, index)` single-sources the
  `${submissionId}:${index}` construction both processors share.
- Any module with a processor/service that makes outbound calls imports
  `HttpModule`.

## Consequences

- **New outbound integrations inject `HttpService` and route through the helper**
  — they do not reach for `fetch`, do not hand-roll `AbortController` timeouts,
  and do not re-implement non-2xx → throw. A reviewer should push back on a new
  native-`fetch` outbound call in `apps/api`.
- **A future retry/circuit-breaker has one home.** `timedPost` (or the
  `HttpService` config it wraps) is the single seam to add it without touching
  every call site.
- **Thrown outbound errors are now `HttpPostError`**, and the message dropped its
  `[webhook]`/`[opencrvs]` prefix (now `Endpoint <url> responded with HTTP
  <status>`). No consumer parses the prefix — it is caught for logging/retry
  only — so this is cosmetic.
- **`OpencrvsProcessor` gained a request timeout** (10s) it previously lacked.
- **Not yet migrated:** `EzpayClient` and `YouthOpportunityWebhookService` are
  already axios but call `http.post`/`firstValueFrom` directly rather than
  through `timedPost`. Folding them onto the shared helper is a deferred
  follow-up, not a blocker — they already satisfy the "axios, not fetch"
  principle.
