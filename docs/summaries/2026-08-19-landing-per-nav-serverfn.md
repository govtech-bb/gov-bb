# Session summary — Stop landing re-running root serverFns per navigation (#2307)

**Date:** 2026-08-19 · **Branch:** `fix/2307-landing-per-nav-serverfn` (off `main`) · resolves #2307

## What shipped

The root route's `beforeLoad` ([apps/landing/src/routes/__root.tsx](../../apps/landing/src/routes/__root.tsx))
resolved the viewer's content `level` (`resolveViewLevel`) and the runtime
`serviceStatuses` (`getServiceStatuses`) — both `createServerFn` — on **every**
navigation. On the client each is an HTTP round-trip, so every in-app navigation
paid ~300–450 ms of sequential server calls.

Now both values resolve through the router's TanStack Query client via
`ensureQueryData`: fetched once, dehydrated into the SSR document and hydrated on
the client by the already-wired `setupRouterSsrQueryIntegration`. Every client
navigation — including the first — reads the cached value with **zero**
`/_serverFn/` round-trips. `router.tsx` also raises `defaultPreloadStaleTime`
from `0` to `30_000` so hover-preloaded route loaders survive the click.

## Why it looks the way it does

- **The comment in `__root.tsx` was wrong.** It claimed the resolved values
  "ride the dehydrated context across client navigations, so there's no
  per-navigation round-trip." TanStack re-runs the root match's `beforeLoad`
  every navigation, so they didn't.

- **A first attempt used a bespoke client memo + an SSR-injected `window`
  global to seed it. It was abandoned.** Two reasons surfaced only under real
  measurement (see below): it hinged on `import.meta.env.SSR` being `false`
  wherever `beforeLoad` runs, and it hand-rolled a serialize/rehydrate channel
  the framework already provides. `ensureQueryData` + the SSR-query integration
  does the same job with no module cache, no `window` global, no inline seed
  script, and no dependency on `import.meta.env.SSR`.

- **Isolation is why `staleTime: Infinity` on the view level is safe.** The
  `QueryClient` is created per `getRouter()` call — one per request on the
  server, one per session on the client — so one viewer's `preview`/`draft`
  grant is never served to another. The grant only changes via a `?preview=`/
  `?draft=` token, which is handled by a separate branch that resolves fresh and
  runs the cookie + redirect side-effects (and must never populate the shared
  query key).

- **`serviceStatuses` uses `staleTime: 60_000`** to mirror the existing 60 s
  server-side cache in `service-status.ts` — an already-open tab picks up an
  admin toggle within 60 s or on reload, matching the documented "already-open
  pages do not self-update" behaviour.

## The dev-vs-prod trap (the reason this was hard to verify)

`vite dev` executes the root `beforeLoad` **server-side on every client
navigation** (`import.meta.env.SSR === true`, `window` undefined), so a manual
test via `pnpm dev:landing` shows the serverFn calls still firing and the fix
looks broken. A **production build** runs `beforeLoad` client-side, where the
query cache is hydrated and the calls disappear. This was confirmed by building
for production, running the Nitro server against a stub forms API, and watching
the network panel: it reproduced the issue's exact serverFn hashes
(`40e6b062`, `c5e428b9`) on the old code and showed zero on the fix. **Always
verify this behaviour against a production build, not `vite dev`.**

## Verification

- `nx run landing:test` — 448 passed, incl. new
  [-root-context.test.ts](../../apps/landing/src/routes/-root-context.test.ts)
  asserting "three navigations → one resolution", token bypass, and the redirect
  path. (This coverage is possible only because the query approach dropped the
  `import.meta.env.SSR` dependency; the earlier memo couldn't be unit-tested in
  landing's server-like Vitest env.)
- `nx run landing:build` — compiles; `nx run landing:lint` — clean.
- Production build + stub forms API + browser Performance API: 0 `/_serverFn/`
  requests across SSR load, first navigation, and subsequent navigations;
  `?preview=` still redirects and strips the token.

## Out of scope

- **Breadcrumb flash** — dissolves once navigation is instant. The related
  `<Link>`→`<a>` change landed separately on `main` as #2310 while this branch
  was open; this branch does not touch `Breadcrumbs.tsx`.
