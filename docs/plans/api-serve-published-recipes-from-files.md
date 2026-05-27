# API — Serve Published Recipes from Files

**Date:** 2026-05-22 (revised 2026-05-26)
**Issue:** [#145 — apps/api leaks unpublished form_definitions drafts when RECIPE_SOURCE=db](https://github.com/govtech-bb/gov-bb/issues/145)

---

## Goal

Make `apps/api` serve form recipes **only** from JSON files committed under `apps/api/src/forms/form-definitions/recipes/{formId}/{version}.json`. Unpublished `form_definitions` rows (builder scratch space) become unreachable from the runtime API. The DB column survives as a guardrail — operators can flip back via env var if needed.

---

## Approach

Adopt option (b) from issue #145: switch the API's read path to files exclusively. Keep the `RECIPE_SOURCE` env switch as a dev-only escape hatch, but flip its default from `"db"` to `"files"` and refuse `"db"` outside of `NODE_ENV=development`. Align the canonical recipes location so the file loader, the form_builder's publish flow, the dump script, and the Dockerfile all reference the same directory.

**Considered alternatives:**

- *Option (a) — add `publishedAt IS NOT NULL` filter to DB queries.* Rejected: doesn't match the actual deployment model (forms ship via merged PRs in `recipes/`), and leaves the same class of bug latent for any future query that forgets the filter.
- *Move recipes to repo-root `recipes/`* (so the loader, publish.ts, and Dockerfile don't have to change). Rejected: colocating recipes with the form module is more conventional, matches what `dump-recipes-to-files.ts` already writes, and matches where the existing committed recipe lives.

---

## Scope

1. **Canonical path alignment** — `apps/api/src/forms/form-definitions/recipes/` becomes the single source of truth. (Already partly underway: `vehicle-colour-change-request/1.0.0.json` is staged at the colocated path, repo-root `recipes/.gitkeep` is staged for deletion, and the dump script already targets it.)
2. **Loader** — `RecipeFileLoaderService` defaults its root to a `__dirname`-relative path so it resolves correctly in both dev (source tree) and prod (compiled `dist/` tree, given the Dockerfile copy below). No hot-reload — restart is required to pick up recipe changes; document this.
3. **Default switch + prod gate** — `RECIPE_SOURCE` defaults to `"files"`. When `RECIPE_SOURCE=db` is set outside `NODE_ENV=development`, log a warning and force `"files"`. This makes `db`-mode strictly a dev iteration tool.
4. **Drafts service** — promote `FormDefinitionsService.loadRecipe` to a public method (rename to `getRecipe()` to disambiguate from the hydrated `findByFormId`). `FormDraftsService.create()` calls it instead of hitting `formDefRepo` directly. Pin `formVersion` from the returned recipe's `version`. End-user drafts can no longer reach an unpublished `form_definitions` row.
5. **Builder publish flow** — `apps/form_builder/app/server/publish.ts` PRs the recipe file to the colocated path instead of repo-root `recipes/`.
6. **Dump script** — `packages/database/scripts/dump-recipes-to-files.ts` is already pointed at the colocated path; verify no churn when rerun.
7. **Dockerfile** — runner stage copies recipes into the compiled tree at `/app/dist/src/forms/form-definitions/recipes/`, mirroring how email `.hbs` templates are already copied (tsc/nx don't bundle `.json` or `.hbs` into `dist/`). Drop the old `COPY recipes/ recipes/` lines in builder + runner.
8. **Tests** — update specs for the three services and the publish flow; add coverage for the new loader path resolution, the prod gate, and the drafts-through-`FormDefinitionsService` change.
9. **Out of scope** — `DraftArchiveService` stays DB-backed (admin path, intentional). The builder UI's own `listForms`/`getRecipe` stay DB-backed (they operate on scratch space). Hot-reload of recipe files in dev. A separate "publish locally in dev" feature is filed as its own issue.

---

## Files

**Modify:**

- `apps/api/src/forms/form-definitions/recipe-file-loader.service.ts`
  - Replace `DEFAULT_RECIPES_ROOT = path.resolve(process.cwd(), "recipes")` with a `__dirname`-relative resolution: `path.resolve(__dirname, "recipes")`. Stable in dev (resolves to `apps/api/src/forms/form-definitions/recipes/`) and prod (resolves to `/app/dist/src/forms/form-definitions/recipes/`, given the Dockerfile copy below).
- `apps/api/src/forms/form-definitions/form-definitions.service.ts`
  - Flip `RECIPE_SOURCE` default from `"db"` to `"files"` (line 24).
  - In `source()`, if `raw === "db"` and `NODE_ENV !== "development"`, log a warning and return `"files"`. Read `NODE_ENV` via `ConfigService` for consistency with the existing pattern.
  - Rename the existing private `loadRecipe` method to `getRecipe` and make it `public` so `FormDraftsService` can call it. Return type stays `Promise<ServiceContractRecipe | null>`.
- `apps/api/src/forms/form-drafts/form-drafts.service.ts`
  - Inject `FormDefinitionsService`. Replace the `formDefRepo.findOne(...)` lookup in `create()` with `formDefinitionsService.getRecipe({ formId, version })`.
  - Pin `formVersion` from the returned recipe's `version` field.
  - Drop the now-unused `FormDefinitionRepository` import/constructor injection.
- `apps/api/src/forms/form-drafts/form-drafts.module.ts`
  - Add `FormDefinitionsModule` to `imports` (or directly provide `FormDefinitionsService` if that's how the codebase already wires cross-module deps — verify).
  - Drop `FormDefinitionRepository` from `providers` if no longer referenced.
- `apps/form_builder/app/server/publish.ts`
  - Change `contentsPath` from `/contents/recipes/${formId}/${version}.json` to `/contents/apps/api/src/forms/form-definitions/recipes/${formId}/${version}.json`.
- `apps/api/Dockerfile`
  - **Builder stage:** drop `COPY --chown=app:app recipes/ recipes/` — the recipes now arrive via `COPY apps/api/ apps/api/`.
  - **Runner stage:** replace `COPY --from=builder --chown=app:app /app/recipes/ ./recipes/` with `COPY --from=builder --chown=app:app /app/apps/api/src/forms/form-definitions/recipes/ ./dist/src/forms/form-definitions/recipes/`. (Mirrors the existing `COPY ... /app/apps/api/src/email/templates/ ./dist/src/email/templates/` pattern — tsc doesn't bundle non-`.ts` assets.)
- `apps/api/.env.example`
  - Document `RECIPE_SOURCE=files|db`, the new default (`files`), and that `db` is honored only when `NODE_ENV=development`.

**Specs to update / add:**

- `apps/api/src/forms/form-definitions/form-definitions.service.spec.ts` — confirm default is now `files`; cover the `NODE_ENV !== "development"` prod gate (forces `files` even when `RECIPE_SOURCE=db`); cover `getRecipe` now being public and returning the raw recipe.
- `apps/api/src/forms/form-definitions/recipe-file-loader.service.spec.ts` — cover the `__dirname`-relative default path resolution.
- `apps/api/src/forms/form-drafts/form-drafts.service.spec.ts` — cover the new lookup path through `FormDefinitionsService.getRecipe`; assert end-user drafts cannot pin to an unpublished form.
- `apps/form_builder/app/server/publish.spec.ts` — update path expectations.

**Verify-only (no edits expected):**

- `packages/database/scripts/dump-recipes-to-files.ts` — already targets the colocated path; rerun and confirm no churn.

---

## Verify

- `pnpm exec nx test api` — all API specs green.
- `pnpm exec nx test form_builder` (or equivalent) — publish spec green.
- `docker build -f apps/api/Dockerfile .` — image builds; recipes appear at `/app/dist/src/forms/form-definitions/recipes/`.
- Boot the API container with no `RECIPE_SOURCE` env var — log line confirms `Loaded N forms (M recipe files) from /app/dist/src/forms/form-definitions/recipes`.
- Manually hit `GET /form-definitions` and `GET /form-definitions/vehicle-colour-change-request` against a container running with the defaults — returns the committed recipe.
- Manually verify a `form_definitions` row with `publishedAt = NULL` does **not** appear in the response.
- Boot the container with `RECIPE_SOURCE=db` and `NODE_ENV=production` — warning is logged and the API still serves files (prod gate works).
- Local dev (`NODE_ENV=development`): set `RECIPE_SOURCE=db`, confirm builder drafts are reachable (dev iteration loop still works).
- Recipe file edits in dev require a server restart — documented in `apps/api/.env.example` and/or the form-definitions README.

---

## Open questions

_None — prod gate folded into Scope (item 3) on 2026-05-26._

---

## Follow-up (separate issues)

- [#153 — form_builder: publish recipes locally in dev (skip the PR loop)](https://github.com/govtech-bb/gov-bb/issues/153)
