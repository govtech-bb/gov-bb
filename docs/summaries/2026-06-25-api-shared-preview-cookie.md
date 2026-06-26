# API mints + reads a shared preview cookie (Phase 3 PR 1 of #1646)

## Context

Phase 3 of issue [#1646](https://github.com/govtech-bb/gov-bb/issues/1646): make
one `?preview=<token>` link unlock a not-yet-public service end to end — its
landing content page **and** its form — by sharing landing's existing `preview`
cookie across both apps. Phases 1 (#1646) and 2
([#1682](https://github.com/govtech-bb/gov-bb/issues/1682)) already shipped the
`meta.visibility` model, the 404 gate, and the `?preview=`/`?draft=` token split.

This session is **PR 1 of a two-PR split** (the user chose to ship the API +
ADRs first, frontends second): Work-stream 1 (API cookie mint/read + env) and
Work-stream 4 (ADRs). Work-streams 2 (forms `credentials:"include"` + URL strip)
and 3 (landing domain-scoped cookie + Start-button check) are deferred to PR 2.

Worked in worktree `recipe-visibility-phase3-api` (branch
`worktree-recipe-visibility-phase3-api`, targets `sandbox`).

## What we did

- **`apps/api/.../form-definitions.controller.ts`** — `get(:formId)` now:
  - reads the `Cookie` request header (`@Headers("cookie")`, hand-parsed by a new
    `readPreviewCookie` — no cookie-parser dependency) and treats a
    `preview`/`draft`/`1` cookie value's **presence** as `bypassVisibility`;
  - mints a `Set-Cookie` (`res.cookie("preview", "preview", …)`) scoped to
    `PREVIEW_COOKIE_DOMAIN` when a valid `X-Recipe-Preview` header arrives.
  - `Cache-Control: no-store` and the 410-disabled precedence are unchanged.
- **`apps/api/src/config/env.validation.ts`** — added optional
  `PREVIEW_COOKIE_DOMAIN` (`z.string().optional()`); unset → host-only cookie.
- **`form-definitions.controller.spec.ts`** — +8 TDD tests (mint with domain,
  host-only fallback + insecure-outside-prod, cookie-presence bypass with no
  re-mint, `draft`-cookie bypasses visibility but not DB sourcing, legacy `1`,
  multi-cookie parse, no-cookie no-bypass, draft-header mints nothing).
- **`apps/api/.env.example`** — documents `PREVIEW_COOKIE_DOMAIN` and the
  `RECIPE_PREVIEW_TOKEN == PREVIEW_SECRET` value-alignment.
- **`docs/decisions/0011-…md`** — re-scoped to the `?draft=`/DB-scratch +
  disabled-form path (it no longer governs the published-form visibility bypass).
- **`docs/decisions/0058-…md`** (new) — the shared preview cookie as a forgeable
  rollout gate.

## Why it looks this way

- **The API mints the cookie because forms can't.** `apps/forms` is a static,
  client-only SPA (deploys WEB, not WEB_COMPUTE — no SSR runtime), so it cannot
  set an `httpOnly` cookie itself. Rather than migrate forms to TanStack Start
  (large blast radius), the API responds with the `Set-Cookie` when the SPA
  forwards a `?preview=` token as `X-Recipe-Preview`. Landing keeps minting it
  server-side. This is the load-bearing architecture fact that shaped the whole
  approach.
- **Cookie presence governs *visibility only*, never DB sourcing.** The two
  signals are kept strictly separate: `bypassVisibility` (cookie OR valid token)
  vs `draft` (the `X-Recipe-Draft` secret header alone). A forged `preview=draft`
  cookie bypasses the 404 gate but cannot make the API serve the unpublished DB
  scratch — that still requires the secret on every request (ADR 0011, which we
  re-scoped to say exactly this). A spec test locks the asymmetry in.
- **The bypass is deliberately forgeable.** Cookie presence is the grant; the
  value is only the level, never a secret. Anyone can hand-set
  `Cookie: preview=preview` and view a non-public *published* form. That's
  acceptable because `visibility` means "not public yet", not "secret" — the same
  posture ADR 0013 took for landing content. ADR 0058 records this so it's a
  deliberate constraint, not a latent surprise. Truly sensitive forms need real
  auth or the `form_disabled_overrides` 410 (which nothing bypasses).
- **Secret alignment is an ops step, not code.** `RECIPE_PREVIEW_TOKEN` is set to
  the same value as landing's `PREVIEW_SECRET` per environment — no renames, no
  code reading a new name, reversible. The PR body carries this as deploy-config
  guidance.
- **maxAge units differ but the wire output matches.** express `res.cookie`
  takes milliseconds (`4*60*60*1000`); landing's Nitro `setCookie` takes seconds
  (`14400`). Both emit `Max-Age=14400` — byte-identical on the wire. Called out
  in a code comment so a future reader doesn't "fix" the units.
- **Staged to be safe to ship alone.** The API change is additive: reading the
  cookie is a no-op when absent, and minting only fires on a valid header. So PR
  1 can land and deploy before the frontends rely on it. ADR 0058 carries a
  sequencing caveat — `PREVIEW_COOKIE_DOMAIN` must stay unset until PR 2 wires
  landing's matching domain, or the browser would keep two same-name cookies.

## Verification

- `pnpm exec nx run api:test` — 926 pass, 4 skipped (incl. the 8 new tests;
  TDD red→green confirmed: 6 cookie tests failed before the controller change,
  all green after). Coverage gates met.
- `pnpm exec nx run-many -t build --exclude=landing,cms` — 16 projects.
- `pnpm exec tsc -b` — clean.
- Security-focused code review (subagent) — 0 defects: cookie can't trigger
  DB-scratch, 410 precedence intact, `res.cookie` options byte-match landing,
  `readPreviewCookie` handles multi-cookie/whitespace/`=`-in-value/suffix-name
  edge cases.
- **Not run:** live cross-app end-to-end — by design impossible on Amplify
  per-PR previews (the `Domain`/`SameSite=Lax` cookie is inert cross-appId), so
  it lands on sandbox after merge / via the local-API recipe.

PR 2 (forms + landing) follows; #1646 stays in progress until it lands.
