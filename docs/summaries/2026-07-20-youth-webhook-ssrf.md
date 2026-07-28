# Session summary — Youth-opportunity webhook SSRF hardening (#2000)

**Date:** 2026-07-20 · **Branch:** `security-2000-youth-webhook-ssrf` (off `main`)

## What shipped

The youth-opportunity (case-management) webhook sent HTTP via a raw
`this.http.post`, following redirects. It now sends via the shared `timedPost`
primitive (`@/forms/submissions/processors/http-post`), which sets
`maxRedirects: 0` — so a `3xx` from the endpoint to an internal host (e.g. the
`169.254.169.254` cloud-metadata endpoint) is refused rather than followed. The
`firstValueFrom` import is dropped; the body is `JSON.stringify`'d; `http-post.ts`
got a one-line doc tweak (it's now the shared outbound primitive, not
submission-only). The spec was rewritten to mock `http.request` (what `timedPost`
calls) and asserts `maxRedirects: 0` plus a redirect→failure case.

## Why it looks the way it does

- **Course-corrected away from `assertSafeUrl` mid-build.** The plan (and the
  issue) originally said "`assertSafeUrl` + `timedPost`". Reading the submission
  path revealed a deliberate #287 decision: `assertSafeUrl` is applied **only to
  recipe-supplied URLs** (attacker-controllable), while **env-sourced endpoints
  are exempt** — "operator deploy config… may legitimately be internal". The
  youth URL is env-sourced (`WEBHOOK_URL`), and `assertSafeUrl` also hard-requires
  `https:`. So applying it would have (a) contradicted #287 and (b) broken a
  legitimately-internal or `http://` case-management endpoint. Dropped it; a
  comment on #2000 records the refinement.

- **`timedPost` alone is the correct fix for a trusted env URL.** The real SSRF
  vector for an operator-configured endpoint isn't a forged URL (the attacker
  can't set it) — it's a **redirect** from that endpoint to an internal host.
  `timedPost`'s `maxRedirects: 0` closes exactly that, and matches how the
  submission path already dispatches env-sourced webhooks. Reuse over reinvent.

- **Behaviour preserved** for a legitimate endpoint: same payload, `X-API-Key`
  header, timeout, and the never-throw contract (dispatch runs post-persist; the
  `assertSafeUrl`/non-2xx/redirect cases all land in the existing try/catch and
  are logged, never thrown). The only visible change is the success log dropping
  the HTTP status number (`timedPost` returns void).

## Verification

Youth spec 5/5 (payload/headers/endpoint, `maxRedirects: 0`, error-swallow,
redirect→failure); `api:build` compiles; full api suite 1167 pass — the one
failure is the known unrelated local-DB migration smoke test (stale rows; fresh
DB unaffected).
