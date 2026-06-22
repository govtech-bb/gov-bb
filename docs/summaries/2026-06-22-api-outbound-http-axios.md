# Standardize apps/api outbound HTTP on axios (TECH-04)

## Context

`apps/api`'s outbound layer ran two HTTP stacks: `EzpayClient` /
`YouthOpportunityWebhookService` on `@nestjs/axios` `HttpService`, while
`WebhookProcessor` and `OpencrvsProcessor` used native `fetch` with a hand-rolled
`AbortController` timeout and duplicated `${submissionId}:${index}` +
non-`ok`-throw logic. Issue [#1421](https://github.com/govtech-bb/gov-bb/issues/1421).

## What we did

- New `processors/http-post.ts`: `timedPost`, `HttpPostError`, `idempotencyKey`
  (+ spec).
- Migrated `WebhookProcessor` and `OpencrvsProcessor` off `fetch` onto the
  helper; injected `HttpService`; imported `HttpModule` into `SubmissionsModule`.
- Reworked both processor specs from `global.fetch` mocking to `HttpService`
  (rxjs `of`) mocking.
- Convention recorded in
  [ADR 0056](../decisions/0056-apps-api-outbound-http-standardizes-on-axios-httpservice.md).

## Why we did it that way

- **axios over native fetch — against the issue's recommendation.** The issue
  suggested consolidating on fetch (lighter, DI-free). We went the other way:
  `HttpService` is constructor-injectable and mockable without patching globals,
  and a single injectable client is the seam to later add a retry/circuit-breaker
  in one place. The tradeoff is a heavier dep we already ship and depend on.
- **`http.request`, not `http.post`.** The webhook processor exposes a
  configurable HTTP verb (no recipe uses non-POST today, but the config supports
  it). `http.post` forces `method: 'post'` and can't express that, so the helper
  uses `http.request({ method, ... })` defaulting to POST — preserving the
  feature rather than silently dropping it.
- **`validateStatus: () => true` + our own throw.** Axios throws its own error on
  non-2xx by default. To preserve the existing "non-2xx → throw with `HTTP
  <status>`" semantics (and the specs asserting it), the helper resolves on any
  status and maps non-2xx to a typed `HttpPostError`. Message lost its
  `[webhook]`/`[opencrvs]` prefix — cosmetic; no consumer parses it.
- **Body stays a pre-serialized string.** The webhook signs the exact bytes sent
  (HMAC). Axios only re-serializes plain objects, so passing the already-stringified
  `body` as `data` keeps signed-bytes == sent-bytes.
- **opencrvs gained a 10s timeout** it previously lacked (matching webhook's
  default) — the one deliberate behaviour addition.
- **ezpay/youth-opportunity left as-is.** Already axios; folding them onto
  `timedPost` is lower-value and would widen the diff. Deferred.

## Open questions

- Fold `EzpayClient` / `YouthOpportunityWebhookService` onto `timedPost` in a
  follow-up? They satisfy the "axios not fetch" principle already but still
  hand-roll their own `http.post` calls.
- Promote `http-post.ts` to a shared `apps/api/src/http/` if a non-processor
  caller ever needs it (kept under `processors/` for now — both consumers live
  there).
