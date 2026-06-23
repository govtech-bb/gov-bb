# 0007 — Runtime recipes load from files, not the `form_definitions` table

**Date:** 2026-05-26
**Status:** Accepted (amended by [0057](0057-recipe-versioning-removed-one-flat-file-per-form.md), #1196)

> **Amendment (2026-06-23, #1196).** This decision stands — files are the runtime
> source of truth and `form_definitions` is builder scratch. Two details changed
> with the removal of recipe versioning: the served path is now the flat
> `recipes/{formId}.json` (legacy `{formId}/{version}.json` retained read-only as
> a fallback until Phase 2), and the scratch table is now **one row per form**
> (`UNIQUE(formId)`) rather than one per `(formId, version)`. See 0057.

## Context

`apps/api` historically had two ways to resolve a published form recipe at
runtime, switched by a `RECIPE_SOURCE` env var:

- `db` (default) — read the recipe out of the `form_definitions` table.
- `files` — read the recipe from JSON committed under a `recipes/` tree.

The `form_definitions` table is the builder's scratch space: every time an
author edits a recipe in `apps/form_builder`, a new row is written. Some are
saved drafts, some are pre-publish snapshots, some are abandoned. There was no
`publishedAt`-style filter — `findOne({ order: { createdAt: "DESC" } })`
happily returned whatever the builder last touched.

The runtime deployment model is different: forms ship as JSON committed to the
repo via PR (the publish flow in `apps/form_builder/app/server/publish.ts`
opens one, and merging it lands the recipe in `dev`). So the file source is
the production source of truth; the `db` mode was a transitional shim from
when forms were authored against the DB only.

Issue #145 was the predictable consequence: with `RECIPE_SOURCE=db` set in any
real environment, end-user-facing endpoints could return unpublished builder
scratch. `FormDraftsService.create()` made it worse — it bypassed
`FormDefinitionsService` entirely and queried `FormDefinitionRepository`
directly to pin draft `formVersion`. Even after switching `RECIPE_SOURCE` to
`files`, drafts kept reading the table.

We considered two fixes (option list on #145):

- **(a) Add `publishedAt IS NOT NULL` filters everywhere we read
  `form_definitions`.** Rejected: doesn't match the deployment model
  (production recipes live in the repo, not the DB), leaves the bug latent for
  any future query that forgets the filter, and asks every caller to remember
  a discipline rather than removing the foot-gun.
- **(b) Make files the only runtime source. Keep `db` as a dev-only escape
  hatch.** Chosen.

## Decision

**The `form_definitions` table is builder scratch space, not a runtime source
of truth.** Runtime recipe reads load from JSON files committed under
`apps/api/src/forms/form-definitions/recipes/{formId}/{version}.json`.

Corollaries:

- **`RECIPE_SOURCE=files` is the default.** Setting `RECIPE_SOURCE=db` is only
  honored when `NODE_ENV=development`. Outside development the value is
  ignored, a warning is logged, and the API falls back to `files`. The prod
  gate lives in `FormDefinitionsService.source()` — callers don't need to
  remember it.
- **Recipe lookups by `formId`+`version` go through
  `FormDefinitionsService.getRecipe()`.** End-user request paths must not
  reach `FormDefinitionRepository` directly. The repository stays available
  to the builder (which legitimately operates on scratch) and to the archival
  flow (`DraftArchiveService`); it is off-limits to everyone else.
- **Recipes are colocated with the API module that loads them.** The on-disk
  path is `apps/api/src/forms/form-definitions/recipes/`. The Dockerfile
  copies that tree to `/app/dist/src/forms/form-definitions/recipes/`,
  mirroring the email-templates pattern (tsc doesn't bundle non-`.ts`
  assets). The publish flow, the dump script, and the GitHub Contents reader
  in `apps/form_builder/app/server/github-recipes.ts` all target the same
  path.

## Consequences

- **Adding a recipe in production = merging a JSON file to the integration
  branch.** Either via the builder's "Publish" flow (which opens a PR) or by
  committing the file directly. The API picks it up after restart — there is
  no hot reload.
- **End-user code paths that resolve a recipe.** Use
  `FormDefinitionsService.getRecipe({ formId, version })`. It returns the raw
  `ServiceContractRecipe` or `null`. Don't inject `FormDefinitionRepository`
  into anything reachable from a public controller; if a code reviewer sees
  that wiring on an end-user path, treat it as a regression of #145.
- **Local development iteration.** Setting `NODE_ENV=development` and
  `RECIPE_SOURCE=db` re-enables the legacy code path so authors can preview a
  builder draft without going through the publish PR. This is the only
  supported reason for `db` mode. A follow-up (#153) tracks a proper
  "publish-locally" flow that avoids the round-trip entirely.
- **`form_definitions` rows are still written and read internally** by the
  builder (`apps/form_builder` and the `/builder/*` API surface), and by
  `DraftArchiveService` (admin path). Those uses are intentional. The
  constraint is on the *end-user* request path.
- **Tests should mock `FormDefinitionsService`, not
  `FormDefinitionRepository`,** when exercising end-user-facing flows. The
  drafts spec is the canonical example.
- **PR target alignment.** The publish flow opens PRs against `dev`. The
  on-disk path in the PR (`apps/api/src/forms/form-definitions/recipes/...`)
  is now canonical across the publish writer, the API loader, the dump
  script, the Dockerfile, and the builder's read-side GitHub Contents
  client.
