# Builder Hosting + GitHub OAuth + Contents-API Reads — Implementation Session

**Date:** 2026-05-22
**Branch:** `feat/builder-hosting-auth`
**Plan:** `docs/superpowers/plans/2026-05-22-builder-hosting-auth.md`
**Spec:** `docs/superpowers/specs/2026-05-22-form-builder-github-publish-design.md` (PR 4 of 5)

## Context

The form_builder was DB-backed and unauthenticated — it couldn't be safely deployed. This session implements PR 4 of the GitHub-publish plan: deploy `apps/form_builder` to AWS Amplify (mirrors `apps/landing`'s Nitro `aws_amplify` preset), gate access behind GitHub OAuth + a write-permission check on `govtech-bb/gov-bb`, and replace the DB-backed "Load existing form" path with reads from the GitHub Contents API. Drafts still live in the database (`submitRecipe`, `updateRecipe`, `nextVersion` unchanged).

## What we did

15 commits, executed via the subagent-driven-development workflow (fresh implementer subagent per task, two-stage review). Salient pieces:

- **Build wiring** — root `amplify.yml` gains a third application block; `apps/form_builder/vite.config.ts` switches to the Nitro `aws_amplify` preset; `nitro@3.0.260429-beta` added to deps to lockstep with landing.
- **Session module** — `apps/form_builder/app/server/session.ts` provides AES-256-GCM encrypted-cookie helpers, `getSession`/`setSession`/`clearSession`, OAuth CSRF state cookie helpers, and a constant-time compare. 24 tests.
- **GitHub Contents API loader** — `apps/form_builder/app/server/github-recipes.ts` provides `listPublishedForms` and `getPublishedRecipe` over `fetch` (no `@octokit/*`). 12 tests.
- **OAuth server functions** — `apps/form_builder/app/server/auth.ts` provides `checkSession`, `initiateGitHubOAuth`, `handleGitHubCallback`, `logoutSession` as `createServerFn` exports.
- **Routes** — `app/routes/builder.tsx` (auth-guard parent layout), `app/routes/auth/{github,github.callback,logout,denied}.tsx`.
- **`forms.ts` migration** — `listForms` and `getRecipe` now read from GitHub; `submitRecipe`/`updateRecipe`/`nextVersion` untouched. New spec at `forms.spec.ts`.

## Why we did it that way

**Server logic moved out of route files into `app/server/auth.ts`.** The plan put all OAuth logic INLINE in route files' `beforeLoad`, directly importing `@tanstack/react-start/server`. TanStack Start's `tanstack-start-core:import-protection` plugin blocks `@tanstack/react-start/server` in any file that gets bundled for the client — every route file qualifies. The fix matches the codebase's existing convention (`forms.ts`, `registry.ts` already use `createServerFn`): server-only logic lives in `app/server/*.ts`, route files are thin shims that call those server functions from `beforeLoad`. The callback's denied-redirect was inverted (server fn returns `{ denied: true }`, route does the `redirect`) for the same reason.

**Jest shims for `@tanstack/react-start` (ESM-only).** ts-jest runs in CJS mode and can't resolve TanStack Start's subpath exports. Added two minimal shims under `apps/form_builder/test-mocks/` plus `moduleNameMapper` entries in `jest.config.ts`. The runtime path is unaffected — production code uses the real package. The spec file's `jest.mock(...)` factory still takes precedence over the mapper.

**Hardening that went beyond the plan's literal code.** Three places where code review caught real correctness gaps that the plan's hand-written snippets had overlooked:

1. `session.ts`'s `decrypt` now requires a 16-byte auth tag — Node accepts shorter tags silently, weakening the 128-bit GCM authentication to as few as 32 bits.
2. `github-recipes.ts` now guards for `Array.isArray` (file vs directory ambiguity), `content === null` (1MB+ files), and `encodeURIComponent`s `formId`/`version` for defense-in-depth.
3. `forms.ts`'s `getRecipe` now calls `serviceContractRecipeSchema.parse()` at the GitHub trust boundary. The plan's tech-stack narrative said recipes are validated by the schema, but the literal Task 11 code skipped validation. Closed the gap.

**Code review findings we deliberately did NOT silently apply.** Each would be a behaviour deviation from the plan that the plan author should weigh. Captured in a follow-up issue. See "Open questions" below.

**Codegen tree refresh as a separate "chore" commit.** Running the build after Task 3 (Nitro preset switch) regenerated `routeTree.gen.ts` with the new plugin's single-quote codegen style. Committing that purely-stylistic refresh separately kept Task 9's diff focused on the new `/builder` parent layout instead of mixing layout + cosmetic noise.

**Tasks 5+6, 7+8 dispatched as pairs.** TDD pairs (failing spec, then implementation) were dispatched as a single subagent each. One subagent producing both commits keeps the red-then-green discipline honest — a separate "implement" subagent could rationalise away a missing red phase.

## Open questions

Five findings from the code-quality review of Tasks 9+10 are deferred (captured in the follow-up issue). The most consequential:

- `repo` OAuth scope is broader than required; `read:user` is dead weight (GitHub returns `login` without it).
- `/auth/logout` uses GET — any cross-origin `<img>` can log a user out. POST + form would close that.
- CSRF state mismatch currently throws a 500 instead of redirecting to a friendly error page.
- `OAUTH_REDIRECT_BASE` with a trailing slash silently breaks the login flow.
- `auth.ts` has no spec file; the OAuth server fns are uncovered (CSRF check, denial path, token-exchange error fallback).

Manual prerequisites the user still needs to do: register the GitHub OAuth App (Task 0), set the four Amplify env vars (Task 1), and the production deploy + smoke test (Task 13).

## What we almost got wrong

The first attempt at Task 9 followed the plan's literal route-file code, which pulled `@tanstack/react-start/server` straight into `builder.tsx`. The build failed with a useful error from TanStack's import-protection plugin. Without that explicit error message the symptom would have been a silent client-bundle bloat or a runtime crash in the browser. Worth remembering: route files in this codebase **cannot** import `@tanstack/react-start/server` directly — always go through `createServerFn`.
