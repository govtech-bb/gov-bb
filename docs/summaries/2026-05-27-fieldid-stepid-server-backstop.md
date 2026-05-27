# Form builder — fieldId/stepId uniqueness server backstop — Implementation Session

**Date:** 2026-05-27
**Branch:** `feat/fieldid-stepid-server-backstop` (off `sandbox`, merges back to `sandbox`)
**Issue:** [#207](https://github.com/govtech-bb/gov-bb/issues/207) — server-side follow-up to [#206](https://github.com/govtech-bb/gov-bb/issues/206)
**Plan:** `docs/plans/fieldid-stepid-uniqueness-server-backstop.md`
**Prior session:** `docs/summaries/2026-05-26-fieldid-stepid-uniqueness.md` (client-side detector), `ADR 0010`

## Context

#206 shipped the recipe-wide fieldId/stepId uniqueness detector and wired it into the manual builder UI as a live client-side gate. ADR 0010 recorded the matching principle but flagged the server as an open hole: "do not treat server-accepted recipes as uniqueness-checked" until a backstop lands. This session closes that hole (#207).

## What we did

- `packages/form-builder/src/duplicate-ids.ts` (+ spec, 10 new tests, TDD red→green): `findRecipeIdCollisionsFromRecipe(recipe, catalog)` — a recipe-shaped wrapper over `deserializeRecipe` + the existing `findRecipeIdCollisions` — and `formatCollisionIssues(collisions)` — the collision→`ValidationIssue[]` formatter lifted out of the UI. Both exported.
- `apps/form_builder_api/src/catalog.ts` (new): `getFullCatalog` + its 60s cache, moved out of `registry.ts` so both routes share one accessor.
- `registry.ts` `/validate`: after a successful `validateFormContract` parse, runs the uniqueness check; collisions → `{ ok: false, issues }` (unchanged `ValidationResult` shape, so the UI's `raw.ok` mapping still works).
- `ai.ts` publish handler: uniqueness-only gate before any DB write → `422 { error, collisions }`.
- `index.tsx`: repointed at `formatCollisionIssues` (was inlining the same strings).

## Why we did it that way

- **The AI publish path is the real target, not `/validate`.** The issue's headline ("wire the detector into `/validate`") is necessary but not sufficient: the AI builder never calls `/validate` — it writes the recipe straight to `FormDefinitionEntity` via `POST /builder/ai/sessions/:id/publish`, and the live forms API reads that same entity. So an AI recipe with duplicate ids reaches users today. The backstop *has* to bite inside the publish handler. Enriching `/validate` is done too (it makes the endpoint authoritative for future callers), but on its own it would only re-cover the manual path, which already gates client-side.

- **Uniqueness-only on the AI path — deliberately NOT a full Zod gate.** `serviceContractRecipeSchema` requires `createdAt`/`updatedAt`/`version`. The manual builder's `serializeRecipeDraft` stamps those; the raw `extractRecipe` output persisted by the AI path does not reliably carry them. Running full `validateFormContract` on the AI recipe would reject currently-working AI recipes for reasons unrelated to duplicate ids — a regression. So the AI gate runs uniqueness only. Full contract conformance for AI output is a separate concern, explicitly out of scope (and would need the AI recipe format to grow those fields first).

- **The wrapper is defensive on purpose.** The AI recipe is unvalidated when the gate runs, and `deserializeRecipe` does `recipe.steps.map(...)` — it throws if `steps` isn't an array. So `findRecipeIdCollisionsFromRecipe` guards `Array.isArray(recipe.steps)` and returns no collisions on a malformed shape rather than throwing. A malformed recipe is a different failure mode than a duplicate id, and the gate must not turn one into the other.

- **Collision check ordered before any DB mutation.** The publish handler deletes a previously-published form (`repo.delete`) before re-saving. The gate sits above that delete, so a rejected republish leaves the existing row intact — it doesn't wipe a good form to reject a bad one.

- **Catalog stays out of `validateFormContract`.** Uniqueness needs the catalog to resolve defaults; `validateFormContract` is the runtime-safe, Zod-only, catalog-free contract check (ADR 0010). Pushing catalog plumbing into `packages/form-types` was rejected. The catalog-dependent check lives in the form-builder package and is invoked by the API routes that already hold the catalog.

- **Formatter extracted for one source of truth.** The UI inlined the collision message strings; `/validate` needs identical strings so the panel reads the same whether the check fired client- or server-side. Extracting `formatCollisionIssues` (rather than re-typing the strings server-side, the plan's fallback) makes drift impossible and gave the strings unit-test coverage.

## What we almost got wrong

- The plan pointed at `apps/form_builder/src/index.tsx` for the UI formatter; the file is actually `apps/form_builder/app/routes/builder/ui/index.tsx`. Worth re-checking the next time the plan references a UI path.

## Verify

- `pnpm exec nx test form-builder` → 71 (was 61; 10 new).
- `pnpm exec nx run-many -t build --exclude landing` → 12 projects green.
- `pnpm exec nx run-many -t test --exclude landing` → 10 projects green (API suite 626 pass / 1 pre-existing skip, form-builder-app 116).
- Route-level tests intentionally skipped: `form_builder_api` has no test harness, and the team chose package tests + manual verify over standing one up. The manual API checks (AI publish → 422 + nothing saved; `/validate` → `ok:false`) and the browser smoke are the user's to run.

## Open questions

- **422 surfacing in the AI builder UI.** The API now returns `422 { error, collisions }`; how the AI chat surfaces that to the author (inline vs. toast) is a small UI follow-up, not blocking the backstop.
- **File-based recipe ingest** (`apps/api` recipe-file-loader) remains out of scope — those recipes arrive via the manual deploy, which gates client-side. `findRecipeIdCollisionsFromRecipe` is reusable there if a check is wanted later.
- **Pre-existing dead import.** `ensureInitialised` in `ai.ts` is imported but unused (not introduced here); left untouched to keep the diff scoped.
