# Session summary — Wire-status regression test for POST /submissions (#2365)

**Date:** 2026-08-20 · **Branch:** `test/2365-submissions-wire-status` (off `main`) · addresses #2365 (split from #2338)

## What shipped

A CI-runnable wire-level test — [submissions.controller.http.spec.ts](../../apps/api/src/forms/submissions/submissions.controller.http.spec.ts)
— asserting `POST /submissions` returns 201 (new) / 200 (completed replay) /
202 (still processing), plus a 7-line comment on `SubmissionsController.create()`.
Test + comment only; no behavioural change.

## Why it looks the way it does

- **This is a follow-up to a non-bug.** #2338 claimed `POST /submissions` always
  returns 201. It doesn't: the controller returns the service's computed
  `statusCode` in the response body, and the global `ResponseInterceptor`
  (`common/response.interceptor.ts`, registered in `main.ts`) runs
  `res.status(body.statusCode)` — so the wire status is already correct. #2338
  overlooked that interceptor (present since April). #2338 was closed
  as already-correct; the only real gap was the missing **test**, which is #2365.

- **Minimal module, not the AppModule integration pattern.** The issue pointed at
  `file-upload.integration.spec.ts` as the house pattern, but that boots the full
  `AppModule` + live Postgres and is `describe.skip`'d — a test copied from it
  wouldn't run in CI and would guard nothing. Instead the spec boots a minimal
  Nest app (controller + mocked `SubmissionsService`/`ConfigService` + the real
  global `ResponseInterceptor`) and drives it with supertest. Runs in CI, no DB,
  and exercises exactly the regression surface: controller body `statusCode` →
  interceptor → wire.

- **The `@HttpCode` comment came from a measured finding.** I first assumed adding
  `@HttpCode` to `create()` would "pin every outcome to one status" and proposed
  the test guard against it. Probing it (injecting `@HttpCode(201)`) showed the
  200/202 tests still passed — the `ResponseInterceptor` runs *after* the handler
  and overrides `@HttpCode`. So `@HttpCode` here is dead code, not a footgun that
  changes behaviour. The comment records that accurately, and the guard-bites
  proof instead breaks the *body* `statusCode` (which the interceptor reads).

- **Asserts wire status AND `body.statusCode` agree** — the #2338 "the two must
  not disagree" property. They share one source (body drives wire via the
  interceptor), so asserting both catches a future split.

## Verification

- New spec: 3 pass. Guard-bites confirmed — hardcoding the body `statusCode`
  fails the 200/202 cases; reverted.
- `nx run api:build` compiles (fixed a Vitest-4 `vi.fn` generic type error that
  the swc-transformed test run hadn't surfaced); lint clean on both files.
- Full `api:test`: two pre-existing, unrelated flakes —
  `add-form-definition-unique-constraint.smoke.spec.ts` (needs a clean local
  Postgres) and `reference-code.spec.ts`'s CSPRNG entropy check (probabilistic).
  Both pass in isolation on retry; neither file is touched here.

## Out of scope

- No controller/service behavioural change (correct behaviour verified in #2338).
- The test guards the controller+interceptor contract, not `main.ts`'s
  registration of the interceptor (that would need a DB-gated full-app boot).
