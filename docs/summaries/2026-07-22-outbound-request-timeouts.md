# Session summary — Add request timeouts to outbound calls (#2080)

**Date:** 2026-07-22 · **Branch:** `outbound-request-timeouts-2080` (off `main`) · relates to #1751

## What shipped

Two server-side outbound calls could hang forever on a slow/stuck upstream;
both now have a finite timeout.

- **Analytics** (`apps/analytics/src/lib/umami-server.ts`): `fetchFormList` and
  `fetchFormDefinition` fetch with `AbortSignal.timeout(15_000)` and, on a
  timeout, return the same empty fallback (`[]` / `empty`) a non-ok response
  already returns. Both exported for testing.
- **Bedrock** (`packages/ai-bedrock/src/converse.ts`): `client.send` is passed
  `{ abortSignal: AbortSignal.timeout(90_000) }`, so a stuck socket rejects
  instead of hanging the sync `/builder/ai/content` route or leaking a
  permanently-"running" edit/upload job.

## Why it looks the way it does

- **`AbortSignal.timeout` over `NodeHttpHandler`.** The repo's existing idiom
  (feature_flagging `api-client.ts`, landing `fetchWithTimeout`) is
  `AbortSignal.timeout`. `NodeHttpHandler({ requestTimeout, connectionTimeout })`
  would add `@smithy/node-http-handler` (not a current dependency) and give
  separate connect/request timeouts we don't need for the "socket accepted,
  never replies" case. So both fixes use `AbortSignal.timeout` — one idiom, no
  new dependency.

- **Values: analytics 15s, Bedrock 90s.** Dashboard data-loads should be snappy
  (15s). A Bedrock call is an LLM generation (`maxTokens` up to 16384) that can
  legitimately take tens of seconds, so 90s is generous enough not to kill a
  valid slow response but finite so a hang can't leak forever.

- **The timeout covers the body read, not just the connection (review fix).**
  The first cut wrapped only the `fetch()` call, leaving `await res.json()`
  outside the catch — so a server that sent headers fast then stalled the body
  would abort during `res.json()` and throw *past* the fallback. Both functions
  now wrap fetch + `res.json()` in one `try`, so a timeout at either phase falls
  back; non-timeout errors (network, malformed JSON) still propagate unchanged.

- **Bedrock test is a wiring test, deliberately.** A mock client's `send`
  doesn't enforce the signal (the AWS SDK does), and a fake-timer test against
  `AbortSignal.timeout` is flaky. So the test asserts `bedrockConverse` hands
  `send` an `AbortSignal` — verifying our contribution, not the SDK's
  enforcement. The analytics timeout→fallback path *is* tested deterministically
  (the stubbed `fetch` / `res.json()` rejects with a `TimeoutError`).

## Verification

- `ai-bedrock` 31 tests; `umami-server.spec` 28 (incl. connection-timeout,
  body-read-timeout, AbortSignal-passed, and non-timeout-rethrow cases).
- `nx run-many -t build --exclude=landing` — 20 projects compile; lint clean on
  `ai-bedrock` + `analytics`.

## Notes

- Left as-is (review finding #3): the two analytics try/catch blocks duplicate
  the timeout-error check feature_flagging/landing also inline. A shared
  `fetchWithTimeout` package helper would dedupe all three, but that's a
  cross-app refactor beyond this issue.
