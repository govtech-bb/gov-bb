# Plan: Harden env-var handling — remove silent insecure/sandbox defaults

Issue: [#1366](https://github.com/govtech-bb/gov-bb/issues/1366) — Harden
env-var handling across the Amplify apps (severity:important).
Companion to [#1364](https://github.com/govtech-bb/gov-bb/issues/1364)
(**closed/done** — landing's Amplify Console env vars are already configured, so
removing the code-side defaults is safe).

## Goal

A missing environment variable can no longer silently degrade an Amplify app.
In production, a required var that is unset **fails fast with a clear message**
(build or boot, per app) instead of falling back to a sandbox/prod/localhost
target; the three security-sensitive vars **fail closed** (no token matches, no
origin allowed) instead of opening a control.

## Approach (from the issue — adopted verbatim)

1. **Dev defaults only in dev.** Keep localhost/dev fallbacks **only** under
   `import.meta.env.DEV` (Vite apps) or `NODE_ENV !== "production"` (Node SSR
   servers). In a production build/boot, no implicit fallback.
2. **Fail fast in production.** Each app validates its required vars with a
   small zod schema / startup assertion and fails with a clear message when one
   is missing — at **boot** for the apps that read `process.env` at runtime
   (chat, form_builder server), at **build** (prebuild assertion) for the
   Vite-frozen client vars (forms, landing, form_builder client), since those
   values are baked at `vite build` and have no runtime boot.
3. **Security-sensitive vars fail closed.** Remove the permissive default
   entirely for `VITE_RECIPE_PREVIEW_TOKEN` (`"demo"`),
   `VITE_START_PAGE_EDITOR_ORIGIN` (any-origin), and
   `VITE_PAYMENT_ALLOWED_ORIGINS` (`ezpay.gov.bb`) so an unset value denies
   rather than allows.

**Per-app validation, no new shared package.** chat already has
`src/config/env.ts` (zod + tests); forms / landing / form_builder get an
equivalent small env module. This matches the issue's "per app" wording and
avoids a cross-framework abstraction (the apps read env differently —
`import.meta.env` vs `process.env`).

**Out of scope (do not touch):** `apps/api` and `apps/form_builder_api` — they
are not Amplify-hosted and read runtime `process.env` (issue says so). Also
`PREVIEW_SECRET` / `DRAFT_SECRET` (those are #1364 Console config, not code).

## Scope — per app

### chat (boot-time, schema already exists)
- `apps/chat/src/config/env.ts`: drop the prod-pointing defaults for
  `LANDING_URL` and `FORM_API_URL`; require them in production, keep dev
  defaults under non-prod. Update `env.test.ts`.

### forms (Vite-frozen)
- `VITE_PAYMENT_ALLOWED_ORIGINS` — [safe-payment-url.ts](apps/forms/src/lib/security/safe-payment-url.ts):
  remove `DEFAULT_ALLOWED_ORIGINS`; unset ⇒ empty allowlist ⇒ no payment origin
  matches (fail closed). Update its spec.
- `VITE_LANDING_URL` — [config/landing.ts](apps/forms/src/config/landing.ts):
  prod default `https://alpha.gov.bb` becomes dev-only.
- `VITE_API_URL` — [lib/api/forms.ts](apps/forms/src/lib/api/forms.ts),
  [lib/api/files.ts](apps/forms/src/lib/api/files.ts): localhost default
  dev-only.
- Add a forms env module + prebuild assertion that fails a production
  `vite build` when a required var is missing.

### landing (Vite → Nitro runtimeConfig + one client-read)
- `VITE_START_PAGE_EDITOR_ORIGIN` — [preview-start-page.tsx](apps/landing/src/routes/preview-start-page.tsx):
  change `isAllowedOrigin` so unset ⇒ reject all origins in prod (today
  `!ALLOWED_ORIGIN || …` returns true for every origin). Dev stays permissive.
- `VITE_FORMS_URL`, `VITE_CHAT_URL`, `VITE_FORMS_API_URL` — locate exact reads
  (server `useRuntimeConfig` and/or client); sandbox defaults become dev-only.
- Add a landing env module + prebuild assertion (production build fails on
  missing required var).

### form_builder (mixed: client VITE_* + server process.env)
- `VITE_RECIPE_PREVIEW_TOKEN` — [form-url.ts](apps/form_builder/app/lib/form-url.ts):
  remove `DEFAULT_PREVIEW_TOKEN = "demo"`; unset ⇒ no preview token sent
  (fail closed). Update spec.
- `PUBLISH_BASE_BRANCH` — [server/publish.ts](apps/form_builder/app/server/publish.ts):
  `dev` default becomes dev-only / required in prod.
- `OAUTH_REDIRECT_BASE` — [server/auth.ts](apps/form_builder/app/server/auth.ts),
  [server/session.ts](apps/form_builder/app/server/session.ts): localhost default
  dev-only.
- `VITE_FORMS_URL`, `VITE_LANDING_PREVIEW_URL` — locate client reads; localhost
  defaults dev-only.
- Boot-time assertion for server vars; build-time guard for the client vars.

### .env.example (all four apps)
- Update `.env.example` to mark each var **required** vs **optional (dev-only
  default)**, per the acceptance criteria.

## Files (known; a few to locate during build)
- chat: `src/config/env.ts`, `src/config/env.test.ts`
- forms: `src/lib/security/safe-payment-url.ts` (+spec), `src/config/landing.ts`,
  `src/lib/api/forms.ts`, `src/lib/api/files.ts`, new `src/config/env.ts`,
  prebuild hook in `package.json`/`vite.config.ts`, `.env.example`
- landing: `src/routes/preview-start-page.tsx`, the `VITE_FORMS_URL`/`VITE_CHAT_URL`/
  `VITE_FORMS_API_URL` reads (to locate), new env module + prebuild, `.env.example`
- form_builder: `app/lib/form-url.ts` (+spec), `app/server/publish.ts`,
  `app/server/auth.ts`, `app/server/session.ts`, client URL reads (to locate),
  env assertion, `.env.example`

## Verify
- Per-app unit tests: required var unset in "production" mode ⇒ throws / build
  fails with a clear message; dev mode ⇒ uses dev default. Extend existing specs
  (chat env.test.ts, safe-payment-url spec, form-url spec).
- Security fail-closed tests: empty `VITE_PAYMENT_ALLOWED_ORIGINS` rejects all
  payment URLs; unset `VITE_START_PAGE_EDITOR_ORIGIN` rejects all postMessage
  origins in prod; unset `VITE_RECIPE_PREVIEW_TOKEN` sends no token.
- `pnpm exec nx run-many -t test` for the four projects.
- `pnpm exec nx run-many -t build --exclude=landing` clean; confirm a production
  build with a deliberately-missing required var **fails** (the point of the
  change), then passes with it set.

## Open questions
- Exact production-detection signal for landing's prebuild guard — Amplify sets
  `NODE_ENV`/branch context; confirm what's reliably available at `vite build`
  time vs. keying off the Vite `mode`. Resolve while implementing the landing
  guard.
- Whether to land as one PR with four per-app commits (recommended) or one
  commit — decide at finish.
