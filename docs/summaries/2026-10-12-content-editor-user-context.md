# Content editor lost its user on re-entry

2026-10-12 · `form_builder` · #3026

## Context

On sandbox, opening the entry page editor sometimes crashed with
`Cannot read properties of undefined (reading 'login')`. It was reported as
"editing the entry page of a new form with no entry page".

## What we did

- `app/router.tsx`: `defaultStaleReloadMode: "blocking"` on the router.
- `app/-router.spec.tsx`: a small route tree (a gate layout with no loader,
  a child with a loader that reads `user.login`, and a sibling). It goes
  child → sibling → child.

## Why we did it that way

**The trigger was re-entry, not a missing page.** The deployed chunk showed
the crash at `user.login`, where `user` comes from `Route.useRouteContext()` in
`StartPagesEditor`. A local production build, with a forged session cookie and
driven by Playwright, crashed only on the *second* visit to `/content/edit`.
`/content` is a gate with no loader, so router-core never caches its match.
`/content/edit` has a loader, so it is cached. On a return visit the stale
child reloads in the background (stale-while-revalidate). That path renders it
without rebuilding its context from the fresh gate `beforeLoad`, so there's no
`user`.

**Router-wide, not `user?.login`.** `/builder` has the same shape and only
escapes because `builder/index.tsx`'s `beforeLoad` happens to `return context`.
A per-caller guard would leave every other gated child exposed. The cost is
that returning to a cached route now waits for its loader, the same as a first
visit, instead of showing stale data while it reloads.

**Not a router upgrade.** router-core 1.171.35 rewrote this pipeline and may
fix it upstream, but that's a much larger change than one option.

**It can't be reproduced in `vite dev`.** There the gate short-circuits to
`{ user: { login: "dev" } }`, so checking this needs a production build.

## Open questions

- If the slower return navigation matters, scope it to the `/content/edit`
  loader (`staleReloadMode: "blocking"`), or re-test after a router upgrade.
