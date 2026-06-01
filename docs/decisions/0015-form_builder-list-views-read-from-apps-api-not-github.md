# 0015 — form_builder list views read from apps/api, not GitHub

**Date:** 2026-05-28
**Status:** Accepted
**Related:** [#309](https://github.com/govtech-bb/gov-bb/issues/309), [ADR 0003](./0003-form-authoring-lives-in-form_builder.md)

## Context

The form_builder "Open" modal renders a list of every published form so the
user can pick one to edit. Until #309, that list came from
`apps/form_builder/app/server/github-recipes.ts:listPublishedForms` — a
synchronous walk of the GitHub Contents API:

1. one call to list directories under `apps/api/src/forms/form-definitions/recipes`,
2. one call **per form** to list its version files,
3. one call **per form** to fetch the latest recipe and read its title.

For ~700 published forms that is ~1,400 GitHub Contents calls per Open click,
which is both slow and unauthenticated-secondary-rate-limit-prone. Meanwhile
`apps/api` already holds the complete recipe set in memory after `onModuleInit`
loads `RecipeFileLoaderService` — the same data, indexed and free to query.

Two structural alternatives were on the table:

- **A.** Have `form_builder_api` read the `recipes/` tree off disk itself.
  Rejected: requires copying `apps/api/src/forms/form-definitions/recipes/`
  into `form_builder_api`'s Docker image **and** wiring `nx affected` to
  rebuild `form_builder_api` whenever a recipe lands, otherwise the Open modal
  silently lags behind a publish until some unrelated change triggers a redeploy.
- **B.** Proxy `apps/api`'s in-memory index over HTTP via a new
  `GET /builder/forms/published` endpoint on `form_builder_api`. Single source
  of truth; the existing publish-to-visibility flow (PR → merge → ECS deploy)
  is unchanged.

## Decision

**Form-builder list/index views read from `apps/api`'s in-memory recipe index
over HTTP. GitHub remains the publish *transport* (PRs against `dev`) but is
not a read source for list-shaped operations.**

The Open modal calls `GET /builder/forms/published` on `form_builder_api`,
which calls `${API_BASE_URL}/form-definitions` on `apps/api` and returns
`{ formId, title, version }[]`. `apps/api`'s `findAll()` was widened to
include `version` so the front-end's draft-vs-published precedence logic still
works without a second lookup.

`form_builder_api` is the only network hop the front-end SSR talks to (it
already proxies drafts, the disabled tombstone list, AI authoring, and
publish), so adding a `published` route there preserves the existing trust
boundary: cookies for the browser, `X-Admin-Token` for service-to-service.

## Consequences

- **Single-form GitHub reads remain.** `getPublishedRecipe` (the single-recipe
  fetch used when opening one form for edit) still goes through GitHub. That
  path is also stale-on-deploy, but a single-form fetch is one call per Open,
  not 1,400, and migrating it is a separate decision. `listVersions` and
  `fetchRecipeFile` in `github-recipes.ts` are kept for that caller.
- **Anyone adding another builder list/index view should reach for `apps/api`,
  not invent another GitHub Contents walk.** Recent edits, search, dashboards,
  reporting — all consume the same in-memory index via `form_builder_api`.
- **`apps/api`'s `findAll` return type is now a published contract.**
  `{ formId, title, version }[]` is consumed by `form_builder_api`. Adding a
  field is non-breaking; widening or removing one isn't, and either touches
  this read path.
- **No new auth surface.** The `GET /form-definitions` endpoint on `apps/api`
  is unauthenticated (only `ThrottlerGuard` applies — 20/10s, 120/60s).
  Service-to-service from `form_builder_api` needs only `API_BASE_URL`, no
  shared secret. If `findAll` ever exposes data that *needs* auth, that
  decision needs to be revisited along with this one.
- **Publish-to-visibility latency is bounded by `apps/api`'s deploy cadence,**
  not by GitHub's eventual consistency. A publish PR merging to `dev` is
  visible in the Open modal once the next ECS deploy rolls out — same
  invariant as before, but now explicit rather than incidental.
