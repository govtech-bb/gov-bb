# Form Builder — Save Draft as Dev Iteration Loop

**Date:** 2026-05-26
**Issue:** [#153 — form_builder + api: dev iteration via Save Draft + API serves DB alongside files](https://github.com/govtech-bb/gov-bb/issues/153)
**Depends on:** [#145](https://github.com/govtech-bb/gov-bb/issues/145) merged (`feat/api-serve-recipes-from-files`). This plan is written against the post-#145 state.

---

## Goal

Make the existing **Save draft** button in `/builder/ui` the canonical local dev iteration path: edit a form, click Save draft, hit `GET /form-definitions/{formId}` from `apps/forms` and see the change immediately — no PR, no redeploy, no JSON written into the local checkout.

---

## Approach

Add a third `RECIPE_SOURCE` mode, `"both"`, that unions disk recipes (`RecipeFileLoaderService`) and DB rows (`FormDefinitionRepository`). DB wins on `formId+version` collision. Gated to `NODE_ENV=development` exactly like the existing `"db"` mode. Default stays `"files"`. The builder gets a small dev-only hint near the **Save draft** button so the developer knows what saving will do.

**Considered alternatives:**

- *Write JSON into the local checkout from the builder.* Original framing of the issue. Rejected: the builder already persists drafts to `form_definitions`; reusing that flow is strictly less code and avoids a second write path the dev has to remember to clean up before publishing.
- *DB wins unconditionally if any DB row exists for a formId.* Rejected: with `Save draft` users normally bump the version, so a DB v1.0.0 should not hide a published file v1.2.0. Picking the highest semver across the union matches "latest version" semantics elsewhere in the loader.
- *Retire `"db"` mode in the same change.* Deferred. `"both"` covers the dev iteration use case and `"db"` removal is independent surface area — keep this PR's blast radius tight.

---

## Scope

1. **API — `"both"` mode.** Extend `RecipeSource`, gate `"both"` on `NODE_ENV=development`, implement the union for `findAll()` and `getRecipe()` with the DB-wins-on-collision rule.
2. **API — env docs.** Document the new mode in `.env.example`.
3. **Builder UI — dev hint.** Add a short note next to the Save draft button in `/builder/ui` visible only in the dev build, explaining that saving makes the form reachable from the local API immediately. No change to the existing write path (`submitRecipe` / `updateRecipe`).
4. **Tests.** Cover the new mode's gating, union behaviour, and collision precedence on the API side. No UI test asserted for the hint (small visual addition).

**Out of scope:**
- Builder warning when a DB draft shadows a published on-disk recipe — follow-up.
- Retiring `RECIPE_SOURCE=db` — follow-up.
- Hot-reload of disk recipes in dev — still requires a server restart (per #145).
- Any change to staging/prod behaviour. The PR/CI/CD path remains the only way to ship a form.

---

## Files

**Modify:**

- `apps/api/src/forms/form-definitions/form-definitions.service.ts`
  - Widen `RecipeSource` to `"db" | "files" | "both"`.
  - `source()`: extend the existing dev-only gate to accept `"both"` and warn + fall back to `"files"` when `NODE_ENV !== "development"`. Mirror the structure of the existing `"db"` branch.
  - `findAll()`: when `source() === "both"`, return `[...file findAll(), ...db findAll()]` deduped by `formId` with the **DB row's title winning** on collision.
  - `getRecipe({ formId, version })`: when `source() === "both"`:
    - If `version` is supplied: try DB first (`formDefRepo.findOne({ where: { formId, version }, order: { createdAt: "DESC" } })`); on miss, fall back to `recipeFileLoader.findByFormId({ formId, version })`.
    - If `version` is omitted: collect the candidate recipe from each source — DB's latest row for `formId` and the file loader's latest version for `formId` — then pick the one with the higher semver using the existing `compareSemver` semantics. **On equal version, DB wins.** If only one source has a recipe, return it.
  - The existing `"db"` and `"files"` branches in both methods stay untouched.

- `apps/api/.env.example`
  - Update the `RECIPE_SOURCE` line to document `files|db|both`, default `files`, and that `db` and `both` are honoured only when `NODE_ENV=development`.

- `apps/form_builder/app/routes/builder/ui/-toolbar.tsx`
  - Render a small hint adjacent to the **Save draft** button when `import.meta.env.DEV` is true. Wording target: *"Saved drafts are served by the local API immediately — no PR needed."* Style as muted/secondary text so it doesn't compete with the button. Keep the button text "Save draft".

**Specs to update:**

- `apps/api/src/forms/form-definitions/form-definitions.service.spec.ts`
  - `source()` gating: `RECIPE_SOURCE=both` outside dev logs a warning and returns `"files"`; in dev it returns `"both"`.
  - `findAll()` in `"both"`: union of file and DB entries, deduped by `formId`. With a collision (same `formId` in files and DB), the DB title appears in the result. With unique `formId`s in each source, both appear.
  - `getRecipe()` in `"both"`, version supplied: DB hit returns the DB schema even if files also have that version (DB-wins). DB miss falls through to the file loader.
  - `getRecipe()` in `"both"`, no version: with DB v1.1.0 and files v1.2.0, returns the file recipe (higher semver). With DB v1.2.0 and files v1.0.0, returns the DB recipe. With DB v1.0.0 and files v1.0.0 (tie), returns DB. With only one source present, returns that source's latest.

**Verify-only (no edits expected):**

- `apps/form_builder/app/server/submitRecipe.ts` and `updateRecipe.ts` — confirm the write path still produces `form_definitions` rows with `published_at = NULL`; no change required.
- `apps/api/src/forms/form-drafts/form-drafts.service.ts` — already routed through `FormDefinitionsService.getRecipe()` per #145; inherits the union behaviour without further change.

---

## Verify

- `pnpm exec nx test api` — all API specs green, including the new `"both"` cases.
- Boot the API with `NODE_ENV=development RECIPE_SOURCE=both`. Save a draft of a brand-new `formId` from `/builder/ui`. `GET /form-definitions` lists it; `GET /form-definitions/{formId}` returns the saved schema. No server restart between save and GET.
- Repeat with a `formId+version` that also exists on disk: confirm `GET /form-definitions/{formId}?version={v}` returns the DB row's schema, not the file's.
- Boot the API with `NODE_ENV=production RECIPE_SOURCE=both`. Log line warns about the unsupported mode and the response set matches files-only.
- Visit `/builder/ui` in the dev build. The Save draft hint is rendered next to the button. Build the form_builder for production (`pnpm exec nx build form_builder` or equivalent) and confirm the hint is absent.

---

## Open questions

_None — proceeding on the issue's leans plus the semver-union behaviour discussed during planning._

---

## Follow-up (separate issues)

- Builder shadowing warning: when a DB draft shadows a published on-disk version of the same `formId+version`, surface a warning in `/builder/ui`.
- Retire `RECIPE_SOURCE=db`: with `"both"` covering dev iteration, the DB-only mode has no remaining use case.
