# 0059 — Frontend env vars fail fast; security-sensitive vars fail closed

## Context

The Amplify-hosted frontend apps (landing, forms, chat, form_builder) inline
their environment variables at `vite build` — Amplify injects Console env vars
into the build container only, never the runtime (the SSR Lambda never sees
them). A missing var was therefore frozen into the bundle until someone noticed
and redeployed.

Several apps fell back to **silent defaults** when a var was unset, producing two
failure modes (#1366):

1. **Wrong-environment leakage** — URL vars defaulted to a sandbox (or prod)
   target, so a non-sandbox deployment that forgot to set them silently talked
   to the wrong environment (e.g. a prod build linking to sandbox forms).
2. **Insecure-by-default** — a few defaults weakened a security control when
   unset, with no signal that hardening was skipped: a guessable `"demo"`
   recipe-preview token, an any-origin `postMessage` gate, and an implicit
   payment-redirect allowlist.

## Decision

Amplify-hosted frontend apps must not silently fall back when a required env var
is unset.

- **Dev defaults only in dev.** A localhost/sandbox/dev default is permitted
  **only** under `import.meta.env.DEV` (Vite apps) or `NODE_ENV !== "production"`
  (server reads). Production has no implicit fallback.
- **Fail fast in production.** A missing required var throws with a clear,
  app-prefixed message (via a per-app `requireEnv()` helper, or a zod schema
  where one already exists). Because the value is frozen at build, this surfaces
  at boot / first use — the earliest point the bundle can detect it.
- **Security-sensitive vars fail closed.** Tokens, origin allowlists, and
  `postMessage` origin checks carry **no** permissive default. Unset denies —
  no token matches, no origin is accepted, no host is allowlisted — never opens.

Validation lives **per app** (no shared cross-framework package), because the
apps read env differently (`import.meta.env` vs `process.env`) and one already
owns a zod schema.

## Consequences

- New env vars in these apps must route through the app's `requireEnv()` (or its
  zod schema) with a dev-only default, or fail fast. A raw
  `import.meta.env.X || "<default>"` for a required var is a defect.
- A new security-sensitive var must default to the closed state, not a usable
  one. Reviewers should reject a guessable/permissive default.
- **Operational:** removing the defaults makes the Amplify Console config
  mandatory. A production/sandbox deploy that has not set these vars now fails
  fast instead of running misconfigured — by design. Companion config work
  (#1364 for landing, and equivalents for forms/chat/form_builder) must set them
  per environment.
- `OAUTH_REDIRECT_BASE` (form_builder) already threw when unset and was left
  unchanged; chat's `FORM_API_URL` was already optional/safe.
