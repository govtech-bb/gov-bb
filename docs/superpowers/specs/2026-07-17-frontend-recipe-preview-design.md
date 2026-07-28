# Frontend recipe preview — render an unmerged form recipe in the per-PR preview

**Date:** 2026-07-17
**Status:** Design (awaiting review)
**Related:** ADR-0007 (runtime recipes load from files, not `form_definitions`), ADR-0013/0058 (preview is a rollout gate, not a confidentiality boundary), ADR-0043 (preview is view-only; submissions require a published version), ADR-0057 (recipe versioning removed — one flat file per form), ADR-0003 (form authoring lives in form_builder), the `hydrateStep`/`conditionalTitle` drift history.

## Problem

A new form recipe added in a PR is only a `recipes/{formId}.json` file **on the PR branch**. It cannot be rendered in a shareable preview link before merge:

- `apps/forms` is a static SPA that fetches an already-hydrated `ServiceContract` from `GET {VITE_API_URL}/form-definitions/{formId}` at runtime.
- On any deployed environment the API serves recipes **only from files baked into its Docker image** (ADR-0007 / #145), read once at boot.
- Per-PR previews rebuild **only the frontend apps** on Amplify; the forms preview points `VITE_API_URL` at the **sandbox API**, whose image is built from `main`.
- So a recipe that exists only on the PR branch is absent from the sandbox API → `GET /form-definitions/{formId}` → 404 → "The form could not be found." It becomes renderable only after merge redeploys the API.

## Key finding that shapes the approach

Recipe **hydration does not need the API or a database**:

- A pure, synchronous `hydrateForm(recipe, catalog)` already exists in `@govtech-bb/form-builder` ([packages/form-builder/src/resolution.ts:44](../../../packages/form-builder/src/resolution.ts)); `getCatalog()` returns the builtins-only catalog with no DB.
- All 76 current recipes reference only builtin components (`components/*`, `blocks/*`) — zero custom/DB components. The only DB touch in the API's hydration path is the custom-component resolver tier, which no served recipe exercises.
- `@govtech-bb/form-builder` and `@govtech-bb/registry` are client-safe (no `fs`/`typeorm`/`node:` imports). `apps/forms` already imports `@govtech-bb/form-types`.

Therefore `apps/forms` can render a recipe entirely on its own: no DB, no API change, no preview token, no per-request exception. The shareable link is just the existing per-PR Amplify forms URL.

**The one caveat:** there are currently **two** `hydrateForm` implementations that have drifted. The API version ([apps/api/src/registry/resolution.ts:98](../../../apps/api/src/registry/resolution.ts)) carries `conditionalTitle`, `markdownContent`, `closingDateTime` and preserves recipe timestamps; the package version does not. A frontend-direct render is only prod-faithful if hydration is **consolidated to one implementation**.

## Scope

- **In scope:** rendering a **brand-new** form recipe (a file present only on the PR branch) in the existing per-PR forms Amplify preview, at prod fidelity, client-side.
- **Out of scope:** previewing **edits** to an already-published form (the sandbox API returns the live version with a 200, so the client fallback never triggers — see Known limitations); test-submission (ADR-0043 keeps preview view-only); shipping preview recipes to any public environment.

## Decisions taken

- **Recipes move to a shared folder** both `apps/api` (runtime) and the `apps/forms` build consume — chosen over a build-step copy that reaches across app boundaries.
- **Hydration is consolidated to one shared `hydrateForm`** used by both `apps/api` and `apps/forms`, rather than only parity-patching the package copy.

## Architecture changes

### A. Recipes → shared data folder

Move the recipe JSON files from `apps/api/src/forms/form-definitions/recipes/` to a repo-root **`recipes/`** data folder. Recipes are data consumed as files by both sides (the API reads them at runtime; the forms build copies them), so a plain data folder is preferred over a buildable TS package — no build ceremony for JSON.

Touch points to update in lockstep:
- **API loader** — `RecipeFileLoaderService` recipe-dir path ([recipe-file-loader.service.ts](../../../apps/api/src/forms/form-definitions/recipe-file-loader.service.ts) `__dirname/recipes` resolution).
- **API Docker image** — the `COPY` of the recipes dir into `dist/...` ([apps/api/Dockerfile:177](../../../apps/api/Dockerfile)).
- **Publish flow** — form_builder commit target `apps/api/.../recipes/{formId}.json` ([apps/form_builder/app/server/publish.ts:161](../../../apps/form_builder/app/server/publish.ts)) and the `RECIPES_BASE` constant + `listVersions`/`fetchRecipeFile` path ([apps/form_builder/app/server/github-recipes.ts:8](../../../apps/form_builder/app/server/github-recipes.ts)).
- **Ref-integrity guard** — recipe-dir path in [scripts/recipe-ref-guards.ts](../../../scripts/recipe-ref-guards.ts) (ADR-0026 keeps this always-run).
- Any tests/fixtures that reference the old path.

This move does not change how recipes load at runtime (still files, ADR-0007) — only where the files live.

### B. Consolidate hydration to one implementation

Standardise on the package's synchronous `hydrateForm(recipe, catalog)` as the single implementation, brought to field parity first:

1. **Parity-patch** `packages/form-builder/src/resolution.ts` to carry `conditionalTitle`, `markdownContent`, `closingDateTime`, and to preserve the recipe's `version`/`createdAt`/`updatedAt` instead of regenerating timestamps — matching the API version's behaviour. Lock the behaviour with tests extended from `resolution.spec.ts`.
2. **Refactor the API** to call the shared package `hydrateForm`. `RegistryService` builds a `RegistryCatalog` from builtins + its already-cached custom components (the pattern `form_builder_api`'s `getFullCatalog()` already uses) and passes it to the package function; delete the bespoke async `hydrateForm` in `apps/api/src/registry/resolution.ts`. The custom-component capability is preserved via the catalog; today's recipes use only builtins.
3. **Parity test** asserting a representative recipe hydrates identically before/after (guards against a prod render regression).

Result: `apps/api` and `apps/forms` expand recipes with byte-identical logic — the preview shows exactly what prod will serve, and the recurring hydration-drift bug class is closed.

### C. Forms client fallback (the render path)

- Add `@govtech-bb/form-builder` and `@govtech-bb/registry` to `apps/forms` (`package.json` dep + `tsconfig.json` reference).
- In [`fetchFormDefinition`](../../../apps/forms/src/lib/api/forms.ts) (`apps/forms/src/lib/api/forms.ts`): try the sandbox API as today; **on a 404**, and only in a preview build (`import.meta.env.VITE_PREVIEW_BUILD === "true"`), fetch the recipe from the app's own origin at `/preview-recipes/{formId}.json`, validate with `serviceContractRecipeSchema`, and hydrate: `hydrateForm(recipe, getCatalog())` → `ServiceContract`.
- **Force view-only** for a client-hydrated contract: thread an `isPreview` signal so the renderer disables Submit (reuse the ADR-0043 mechanism; the fallback recipe is by definition unpublished). This does not depend on the `?preview` URL flag.
- Outside preview builds the fallback is inert: a 404 stays a 404 (a genuinely missing form on sandbox/prod).

### D. Build & deploy wiring

- In the forms **preview** build (`amplify.yml`, forms `appRoot`): copy `recipes/*.json` into the build output `preview-recipes/` and set `VITE_PREVIEW_BUILD=true`.
- **Gate both to true per-PR preview branches only.** Guard on `$AWS_BRANCH` so the copy and the flag are skipped on `main`/`sandbox`/`staging`/`prod`. This keeps unpublished/draft-visibility recipes off every public environment (see Security).

## Data flow

1. Per-PR forms Amplify build copies the branch's `recipes/*.json` to `dist/preview-recipes/` and sets `VITE_PREVIEW_BUILD=true` (preview branches only).
2. A reviewer opens `https://{branch}.{appId}.amplifyapp.com/{formId}` — no token needed.
3. The SPA calls the sandbox API. For a brand-new form the API returns 404.
4. The SPA (preview build) fetches `/preview-recipes/{formId}.json` from its own origin, validates it, and hydrates it client-side with the shared `hydrateForm` + builtins catalog.
5. The form renders, prod-faithfully, with Submit disabled (view-only).

## Security & guardrails

- **No new secret, no new network surface, no API change.** The whole path is static assets + client code.
- **Preview recipes never reach a public environment.** The copy step and `VITE_PREVIEW_BUILD` are gated to per-PR preview branches; `main`/`sandbox`/`staging`/`prod` builds ship neither the `preview-recipes/` assets nor the flag, so no draft-visibility recipe is fetchable there. This is the only real guardrail and must be enforced in `amplify.yml`.
- **Forgeable by design, acceptable.** Anyone with a per-PR preview URL can fetch its `preview-recipes/*.json`. This matches the accepted rollout-gate posture for preview environments (ADR-0013/0058): a per-PR preview is "not public yet", not secret.
- **View-only preserved.** No submission record is produced from an unmerged recipe (ADR-0043); Submit is disabled on the client-hydrated path.

## Known limitations

- **Edits to existing forms show the live version.** For a PR that modifies an already-published form, the sandbox API returns the current (main) version with a 200, so the fallback never fires and the preview shows the pre-edit form. This honours the agreed "new forms only" scope. Extending to edited forms is a small, natural follow-up: in preview builds prefer the bundled recipe when present (bundle-first instead of API-first). Deferred deliberately.
- **DB-sourced processor config is not merged on the client path.** The API's `findByFormId` merges per-form processor config from `form_config` (ADR-0033: config never enters the recipe). A client-hydrated preview reflects the recipe only. Acceptable because preview is view-only (no submission/payment is exercised); flagged so it isn't mistaken for a bug.

## Testing

- **Package unit (hydration parity):** the parity-patched `hydrateForm` carries `conditionalTitle`/`markdownContent`/`closingDateTime` and preserves recipe timestamps; a representative recipe hydrates identically to the pre-refactor API output.
- **API unit (post-refactor):** `RegistryService` builds a builtins+custom catalog and produces the same contract as before for a builtin-only recipe and for a recipe using a (mocked) custom component.
- **Forms unit:** `fetchFormDefinition` falls back to `/preview-recipes/{formId}.json` only on a 404 **and** when `VITE_PREVIEW_BUILD=true`; the client-hydrated contract is marked view-only (Submit disabled); outside a preview build a 404 propagates unchanged.
- **Guard/tooling:** `scripts/recipe-ref-guards.ts` and the API loader resolve the new `recipes/` path; publish writes to the new path.
- **Manual / e2e:** on a PR adding a new recipe, open the per-PR forms preview at `/{formId}` and confirm it renders with Submit disabled; confirm a non-preview build does not expose `/preview-recipes/`.

## Sequencing

1. **B first, standalone** — consolidate hydration and land it (a self-contained, independently valuable de-duplication; the API keeps working exactly as before).
2. **A** — move recipes to `recipes/`, updating loader, Dockerfile, publish flow, and ref-guards in one change; verify the API still serves every form and publish still round-trips.
3. **C + D** — add the forms fallback and the preview build wiring.

Each step is independently shippable and leaves the system green.
