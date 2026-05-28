# Fast Open-modal: stop walking GitHub from the form-picker

## Context

Issue [#309](https://github.com/govtech-bb/gov-bb/issues/309). The form_builder
"Open" modal lists every published form so the user can pick one to edit. The
listing came from `apps/form_builder/app/server/github-recipes.ts:listPublishedForms`,
which walked the GitHub Contents API: one call for the top-level recipes
directory, then **two calls per form** (one to list versions, one to fetch the
latest recipe and read its title). For ~700 forms in sandbox that's ~1,400
Contents requests per Open click — slow, and a hair away from GitHub's
unauthenticated secondary rate limit. Meanwhile `apps/api` already holds the
complete recipe set in memory from `onModuleInit`.

Implemented from `docs/plans/form-builder-open-modal-fast-list.md` on branch
`form-builder/fast-published-list` (merges into `sandbox`).

## What we did

- **`apps/api`:** widened `findAll()` from `{ formId, title }[]` to
  `{ formId, title, version }[]` across `RecipeFileLoaderService`,
  `FormDefinitionsService` (files / db / both paths), and
  `FormDefinitionsController`. The wrapper shape on the wire
  (`{ success, data, message }`) is unchanged — only the element type widens.
  Tests at all three layers + the dedicated `findAll` block updated.
- **`apps/form_builder_api`:** new `GET /builder/forms/published` handler in
  `src/routes/forms.ts`, registered **before** `/:formId` so "published" isn't
  captured as a `formId`. Proxies `${API_BASE_URL}/form-definitions`, unwraps
  `body.data`, returns `{ formId, title, version }[]` verbatim. New
  `forms.published.spec.ts` covers happy path, upstream non-2xx → 502, fetch
  throw → 502, and missing-env → 500.
- **`apps/form_builder`:** `listForms` now calls
  `api.get<...>("/builder/forms/published")` instead of `listPublishedForms`.
  The `token` extraction and the `{ context }` destructure dropped — drafts and
  disabled never needed it. New `forms.spec.ts` covers all three endpoint
  calls, draft-vs-published version precedence (both directions), and disabled
  filtering.
- **`github-recipes.ts`:** only `listPublishedForms` (and its
  `PublishedFormSummary` interface) removed. `listVersions`, `fetchRecipeFile`,
  and `getPublishedRecipe` stay — the single-form fetch path (opening one form
  for edit) still goes through GitHub. That's an explicit out-of-scope item.
- **ADR-0015** codifies the principle: form_builder list/index views read from
  `apps/api`'s in-memory index, not GitHub.
- **`.env.example`:** documents `API_BASE_URL=http://localhost:3001` and that
  the handler returns 500 if unset.

## Why we did it that way

- **Approach B over Approach A.** The plan considered having `form_builder_api`
  read the `recipes/` tree off disk itself. Rejected because it requires both
  copying the recipes into `form_builder_api`'s Docker image **and** wiring
  `nx affected` to rebuild `form_builder_api` whenever a recipe lands —
  otherwise the Open modal silently lags behind a publish until some unrelated
  change triggers a redeploy. Proxying `apps/api`'s loader keeps a single
  source of truth and rides the existing publish-to-visibility flow
  unchanged. See ADR-0015.
- **`API_BASE_URL` fails per-request, not at boot.** The handler reads
  `process.env.API_BASE_URL` on every request and returns
  `500 { error: "API_BASE_URL is not set" }` if missing. This mirrors
  `BUILDER_API_URL` in `apps/form_builder/app/server/api-client.ts` (read at
  module top, throw in the call site) — *not* the
  `ADMIN_API_TOKEN` dev-passthrough pattern in `middleware/auth.ts`.
  Service-to-service has no sensible "let it through in dev" semantics; a
  clean error in the handler is cheaper than a startup crash that blocks
  unrelated dev work.
- **502 on upstream failure, not 500.** A flaky `apps/api` is an upstream
  problem; surfacing the upstream status + body as a 502 puts the cause on the
  network panel rather than buried under a generic 500. Matches the existing
  `forms.ts` handlers' error shape (`{ error: string, ... }`).
- **No auth on the new hop.** `GET /form-definitions` on `apps/api` is
  unauthenticated (only `ThrottlerGuard`), so the service-to-service call
  needs only `API_BASE_URL`. The endpoint's throttle (20/10s, 120/60s) is well
  above one call per Open-modal click. If `findAll` ever exposes data that
  needs auth, the decision in ADR-0015 has to be revisited along with it.

## What we almost got wrong

- **Removing too much from `github-recipes.ts`.** First instinct was to delete
  `listVersions` and `fetchRecipeFile` along with `listPublishedForms`. They
  look like dead code if you grep for callers only in this file. They're not:
  `getPublishedRecipe` (the single-form path) calls both. The plan called this
  out explicitly; without it, the Open-and-edit path would have broken with no
  test catching it (no single-form-fetch test exercises the live network).
- **Front-end version precedence required widening `findAll`.** The original
  `findAll` returned `{ formId, title }` only. The Open modal's merge picks
  draft-over-published when the draft's version is newer (`forms.ts:25-34`),
  so dropping `version` from the published side would silently keep stale
  drafts visible after a publish bumped past them. Caught in planning, but it
  would have been an easy thing to miss in a more incremental swap.

## Open questions / follow-ups

- **Browser smoke against sandbox still pending** — needs the deployed sandbox
  env with its ~700 published forms to confirm the under-1s wall-clock and the
  zero-GitHub-Contents-calls Network-panel check from the plan.
- **`getPublishedRecipe` (single-form, opening one for edit) is still on
  GitHub.** Same staleness-on-deploy story, but one call per Open instead of
  1,400 — a separate decision, deliberately out of scope here.
- **`docker-compose.yml` doesn't run `form_builder_api`** today; only
  `.env.example` was updated. If we want a `form_builder_api` service in
  compose, that's a follow-up.
