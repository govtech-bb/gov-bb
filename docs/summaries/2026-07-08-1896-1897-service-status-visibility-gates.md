# Service-status visibility gates (#1896 forms API, #1897 landing)

**Date:** 2026-07-08
**Branches:** `service-status-forms-gate` (Fixes #1896), `service-status-landing-gate`
(Fixes #1897) — both PRs against `main`, part of epic #1650.

## Context

The `service_status` tables (#1876) and API endpoints (#1886) existed and the
admin UI (#1898) is in flight, but nothing consumed the rows — toggling a
status had no effect on the live site. This session implemented the two
consumer gates from the approved plan as parallel, file-disjoint workstreams
(two subagents in separate worktrees off `main`).

## What we did

- **apps/api:** one exported `effectiveVisibility(recipeVisibility, status)`
  centralizes the list / maintenance / `getRecipe` gates in
  `FormDefinitionsService`; a status row fully overrides the recipe seed
  (`enabled`→public, `form_disabled`→maintenance, `disabled`→preview; no
  row→recipe visibility). `RecipeFileLoaderService.findAll` now returns every
  recipe visibility-stamped (the filter moved up); its `findMaintenanceFormIds`
  became dead and was removed. `ServiceStatusService.getStatus(slug)` added for
  the single-recipe path.
- **apps/landing:** generic `lib/cached-resolver.ts` extracted from
  `available-forms.ts` (its test file needed zero edits — the refactor proof);
  new `lib/service-status.ts` (60s TTL, strict envelope validation, fail-open);
  optional `statusOverrides` threaded through the registry visibility functions
  and every runtime call site (homepage, services listing, `$.tsx` incl.
  Start-link computation, four static feature routes); shared `lib/forms-api.ts`
  HTTP helpers.
- **ADR 0063** records the mapping and "row fully overrides seed" semantics for
  both consumers; see it rather than this summary for the decision itself.

## Why we did it that way

- **DB read per request on the API, cached fetch on landing.** The API is the
  same app as the table — one read per request is exactly the freshness #1896
  asks for, with no cache to invalidate. Landing is a separate app hitting the
  API over HTTP, so it reuses the ADR-0030 available-forms pattern (60s TTL,
  last-known-good, cold-start retries) instead of inventing a second freshness
  model.
- **`disabled` maps to `preview`, not `draft`** — it gates visibility only;
  draft's extra DB-scratch meaning stays untouched.
- **`form_disabled` reuses the #1694 maintenance machinery wholesale**, so
  landing needed zero changes for the form-side behaviour (Start button hides,
  maintenance notice shows, via the existing available-forms fetches).
- **Byte-identical public response with an empty status table** was a hard
  constraint (#1835 contract), pinned by an explicit test — the API PR is
  provably a no-op until rows exist. The separately approved one-time seed
  (`docs/plans/1650-service-status-seed-migration.md`) then makes rows exist
  for every current service.
- **Fail-open everywhere on landing:** any fetch/RPC failure degrades to
  frontmatter-only. A status-endpoint outage must never 404 public pages.

## What we almost got wrong

- **The plan's call-site list missed the homepage.** `index.tsx` filters
  categories with `isCategoryVisible` but wasn't in the plan's enumeration;
  code review caught that a DB-enabled service wouldn't surface its category on
  the front door (and a disabled one would leave a dead link). Lesson: derive
  call-site lists by grepping the gate functions, not from the plan's memory.
- **Async `head()` looked clean, was a trap.** The first pass had the three
  feature form routes fetching the status map twice per request (async
  `beforeLoad` + async `head`). On a cold instance that meant uncoordinated
  3-retry chains against `GET /service_status`, which is throttled at
  5 req/10s — and an uncaught RPC rejection in `beforeLoad` on a client-side
  navigation would have errored the route (fail-closed). Reworked to one fetch
  per request shared via route context, with `.catch(() => undefined)` at every
  call site, pinned by fail-open tests.
- Review also threaded overrides through `startSubPageLevel` /
  `isStartSubPageVisible` — otherwise preview-cookie reviewers would see
  Start links computed from frontmatter only.

## Open questions

- Accepted gaps (in ADR 0063): `lib/sitemap.ts` and `lib/search.ts` stay
  frontmatter-only — a DB-disabled page lingers there but its URL 404s.
  Revisit if SEO complains.
- Operational: the API now honors rows immediately per request — keep
  `disabled`/`form_disabled` rows off the sandbox smoke-gated forms, or the
  preview smoke breaks.
- End-to-end click-through (toggle → page/form flips within ≤60s) deferred to
  post-merge sandbox, in a real browser per repo convention.
