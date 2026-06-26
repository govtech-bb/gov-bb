# Harden env-var handling across the Amplify apps

**Issue:** [#1366](https://github.com/govtech-bb/gov-bb/issues/1366) — remove
silent sandbox/insecure env-var defaults (severity:important). Companion to the
closed [#1364](https://github.com/govtech-bb/gov-bb/issues/1364) (landing's
Amplify Console vars, already configured).

## What changed

Across landing, forms, chat, and form_builder, env vars that silently fell back
to a sandbox/prod/localhost target — or weakened a security control — now fail
fast in production, and the three security-sensitive vars fail *closed*. Recorded
as a convention in [ADR 0059](../decisions/0059-frontend-env-vars-fail-fast-and-security-vars-fail-closed.md).

Delivered as one branch (`harden-env-var-handling`, off `sandbox`) with **four
commits, one per app**, in the order landing → forms → chat → form_builder — so a
reviewer reads each app in isolation.

## Why it looks the way it does

**The build/boot mechanic drove the design.** All four apps are Vite-built and
freeze env at build time (chat included — it reads `process.env.X` literals that
Vite's `define` bakes in, not a runtime service). So there is no separate
"runtime boot" to validate against; the fail-fast is a throw at module
evaluation / first use, gated on `import.meta.env.DEV` (or `NODE_ENV` for chat,
whose tests run on `node:test` where `import.meta.env` is absent). A heavyweight
build-time Vite plugin was considered and rejected — the issue's prescribed
`import.meta.env.DEV`-gated reads achieve the same result with far less surface.

**Per-app helper, not a shared package.** Each app got its own small
`requireEnv(value, name, devDefault)` (chat reused its existing zod schema).
The apps read env differently (`import.meta.env` vs `process.env`) and live in
different frameworks, so a shared abstraction would have leaked complexity for
little gain. This matches the issue's "per app" wording.

**Security vars fail closed, not fail-fast-throw.** `VITE_RECIPE_PREVIEW_TOKEN`,
`VITE_START_PAGE_EDITOR_ORIGIN`, and `VITE_PAYMENT_ALLOWED_ORIGINS` deliberately
degrade to deny (empty token / no origin / empty allowlist) rather than throwing
— a thrown error would break the surrounding feature, whereas failing closed
keeps the app up while denying the unconfigured capability. That is the issue's
explicit ask.

**Two issue-table claims were stale and adjusted.** Chat's `FORM_API_URL` had no
sandbox default (already optional/safe), and form_builder's `OAUTH_REDIRECT_BASE`
already throws when unset in the OAuth routes — both left untouched rather than
inventing changes, per surgical-change discipline.

**Known nuance (AC1).** Validation is lazy per read-site, so most vars fail at
boot (eagerly imported) but form_builder's `PUBLISH_BASE_BRANCH` /
`VITE_LANDING_PREVIEW_URL` fail at first use of their feature. A centralized
boot assertion was offered and not taken; the spirit of "fail fast in
production" holds either way.

## Operational note

Removing the defaults makes the Amplify Console config **mandatory** for
forms/chat/form_builder (as #1364 already did for landing). A deploy that hasn't
set these vars now fails fast instead of running misconfigured — by design, but
it must be sequenced with the per-app Console configuration.

## Tests

Per-app `requireEnv`/env specs (value / dev-default / prod-throw), plus
fail-closed specs for each security var, and chat's `resolveBaseBranch`
production-fail case. All green: landing 160, forms 745, chat 161,
form_builder 632; full `nx run-many -t build` clean across 16 projects.
