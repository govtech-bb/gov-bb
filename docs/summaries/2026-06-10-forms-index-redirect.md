# Redirect the forms index to the main GOV.BB site

## Context

The forms app root (e.g. `https://forms.staging.alpha.gov.bb/`) rendered a raw
list of every published form. Forms are meant to be reached via a proper start
page on the main GOV.BB site — landing on a bare index sets the wrong
expectations and is also a blocker for going live. The fix: redirect the index
to the main site. Done on `forms-index-redirect` (targets `sandbox`).

## What we did

- **`apps/forms/src/lib/env.ts`** — added `getHomeUrl()`, returning
  `import.meta.env.VITE_HOME_URL` (or `undefined` when unset/empty). Mirrors the
  existing `isDevMode()` wrapper.
- **`apps/forms/src/routes/index.tsx`** — added a `beforeLoad` to the `/` route
  that, when `getHomeUrl()` returns a URL, throws
  `redirect({ href, replace: true })`. Unset → no-op, index renders as before.
- **`apps/forms/.env.example`** — documented `VITE_HOME_URL` (per-env; commented
  out so it stays unset locally).
- **`apps/forms/src/routes/index.spec.tsx`** — mocked `redirect` + `getHomeUrl`;
  two `beforeLoad` tests (throws external redirect when set; no throw when unset).

Forms suite: 708 passed / 1 skipped; `forms:build` clean.

## Why we did it that way

- **Env-var-driven, not hardcoded.** The app runs on staging
  (`staging.alpha.gov.bb`) and production (`alpha.gov.bb`); a hardcoded target
  would send prod users to the wrong site and need a code change to update.
  `VITE_HOME_URL` lets each environment set its own destination.
- **Redirect in `beforeLoad`, not the component.** `beforeLoad` runs before the
  route loader, so the form-definitions fetch never fires and the list never
  flashes into a render before bouncing. Doing it in the component would render
  the list first.
- **Unset locally on purpose.** Developers use the index to find and open forms.
  Gating the redirect on the env var (unset in local dev) keeps the list for
  them while redirecting on deployed environments. Safe default: with no var set,
  nothing redirects.
- **Env read routed through `lib/env.ts`.** `ts-jest-mock-import-meta` freezes
  `import.meta.env` at compile time, so a call site reading it directly can't be
  varied per test. The `getHomeUrl()` wrapper is `jest.mock()`-able — the same
  reason `isDevMode()` exists.
- **App-level over an Amplify edge redirect.** An Amplify 301/302 would redirect
  instantly with no bundle load and correct SEO, but it's infra config outside
  this repo, can collide with the SPA catch-all rewrite, and isn't unit-testable
  here. We chose the in-repo, tested, version-controlled path.

## Open questions / accepted limitations

- **Client-side redirect.** Because it runs in the SPA, there's a brief moment
  where the bundle loads before it bounces, and it's not a true HTTP redirect —
  crawlers can see the forms-app URL. Accepted for now; an Amplify edge redirect
  could be layered on later if SEO/instant-redirect matters.
- **Deployment step (out of repo):** `VITE_HOME_URL` must be set in the
  staging/production Amplify build environment for the redirect to take effect
  (`https://staging.alpha.gov.bb` / `https://alpha.gov.bb`). Confirm the exact
  production host before setting it.
