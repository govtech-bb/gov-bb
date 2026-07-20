# Session summary — Rate-limit the public chat endpoint (#1972)

**Date:** 2026-07-16 · **Branch:** `security-1972-chat-rate-limit` (off `main`)

## What shipped

A per-IP request limiter on `POST /api/chat`. Each chat turn triggers a RAG
lookup + a paid Bedrock inference, and the endpoint is public and
unauthenticated — so without an app-level cap it's a cost-amplification / DoS
vector. Requests beyond `CHAT_RATE_LIMIT` (default 20) per 60s window per client
IP now get a `429` + `Retry-After` before any parsing, retrieval, or model call.

- `apps/chat/src/lib/chat/rate-limit.ts` — `getClientIp`, `checkRateLimit`
  (fixed-window, in-memory), `rateLimitHeaders` (draft-7).
- `apps/chat/src/lib/chat/rate-limit.test.ts` — 6 `node:test` cases.
- `api.chat.ts` — `handlePost` exported; limit checked first; 429 + headers.
- `config/env.ts` — `CHAT_RATE_LIMIT` (default 20); `.env.example` documents it.

## Why it looks the way it does

- **Reproduce the house pattern, not the house library.** The repo already has
  two rate-limit standards — `express-rate-limit` (form_builder_api) and
  `@nestjs/throttler` (apps/api) — but both are framework-coupled, and the chat
  endpoint is a TanStack Start web-standard `Request → Response` handler on
  h3/Nitro, which is neither Express nor Nest. So the literal libraries can't be
  dropped in. Rather than force an adapter, we reproduced form_builder_api's
  *conventions* (60s window, env-tunable limit, in-memory per-process, 429 +
  draft-7 headers) in a ~90-line module. "Reuse the standard" meant reuse the
  policy, because the runtime can't host the library.

- **Per-process, in-memory — deliberately.** Matches both existing limiters
  (their buckets are per-process too). With N instances the effective ceiling is
  N× the limit; that's fine for a defense-in-depth speed-bump whose real
  perimeter is the AWS WAF rate rule. A shared store (Redis) is the documented
  upgrade path if horizontal scaling makes per-instance buckets material.

- **Best-effort IP from `x-forwarded-for`.** Behind CloudFront the socket peer is
  the proxy, so the client comes from XFF. This is a speed-bump, not identity: a
  client can spoof XFF, so airtight IP control stays the WAF's job. Notably this
  is still *finer* than form_builder_api, which keys on the proxy IP and shares
  one bucket per task.

- **Checked first; no IP logged.** The limit is evaluated before body parse /
  RAG / Bedrock, so a flood is cheap to reject. The rate-limit log line omits the
  IP (PII).

- **Tuned tighter than the builder API.** Default 20/min (vs builder's 120): chat
  is public and each request costs a model call, where the builder is
  authenticated authoring traffic. Retune via `CHAT_RATE_LIMIT`, not code.

## Deviations from the plan (both intentional)

- Chat uses the **Node test runner** (`tsx --test`, `node:test`), not Vitest —
  the plan assumed Vitest; the test was written in the actual house style.
- `handlePost` was **exported** for testability; the 429 logic is covered by
  thorough unit tests of the limiter rather than a full handler test (the handler
  is `getServerEnv`/RAG/Bedrock-heavy).

## Verification

Unit tests 6/6; full chat suite 166 pass / 0 fail (7 pre-existing skips);
`chat:build` succeeds. No live-URL check — this is pure in-process logic, so the
unit tests are the verification (unlike #1971's a11y gate, which needed a
deployed URL).
