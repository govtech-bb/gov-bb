# Form builder save-draft dev iteration — Implementation Session

**Date:** 2026-05-26
**Branch:** `feat/form-builder-save-draft-dev-iteration`
**Issue:** [#153](https://github.com/govtech-bb/gov-bb/issues/153) — form_builder + api: dev iteration via Save Draft + API serves DB alongside files
**Plan:** `docs/plans/form-builder-save-draft-dev-iteration.md`
**ADR:** `docs/decisions/0008-form-builder-catalog-aligns-with-api-registry.md`

## Context

After #145 made files the only runtime recipe source (see
[0007](../decisions/0007-runtime-recipes-load-from-files-not-form_definitions-table.md)),
the local-dev workflow for authoring a form regressed. Save draft from
`/builder/ui` writes to `form_definitions`, but every end-user `GET
/form-definitions/{formId}` reads from disk — so a dev who wanted to preview
their change had to open a PR, merge to `dev`, redeploy. The plan added a
third `RECIPE_SOURCE` mode, `both`, that unions disk and DB (DB wins on
collision, semver tiebreak favours DB), gated to `NODE_ENV=development` just
like the existing `db` mode.

## What we did

**Single-session, TDD-driven.** Working tree on `feat/form-builder-save-
draft-dev-iteration`; no worktrees this time. Wrote the spec cases the plan
enumerated, watched them fail, implemented the minimum to turn each one
green:

- `FormDefinitionsService.source()` extended to recognize `"both"` with the
  same dev-only gate as `"db"`; warning message templated on the input.
- `findAll()` in `"both"`: unions `findAllFromDb()` with
  `recipeFileLoader.findAll()` deduped by `formId`, DB-wins-on-collision.
- `getRecipe()` in `"both"`: with a version, tries DB then falls through to
  files; without a version, picks the higher semver across sources (DB wins
  on tie). Reuses `compareSemver` — exported from `recipe-file-loader.service`
  for this.
- `findAllFromDb()` / `getRecipeFromDb()` extracted so the existing `"db"`
  branch and the new `"both"` branch share the same DB code paths.
- 8 new tests added to the service spec covering gating, both findAll union
  cases, all getRecipe with-and-without-version permutations.
- Toolbar got a dev-only hint next to **Save draft**, gated on
  `import.meta.env.DEV`. Added `apps/form_builder/app/types/vite-env.d.ts`
  with a `vite/client` triple-slash so TS recognized `import.meta.env`.

One commit: `fdc1943 feat(api): RECIPE_SOURCE=both mode for save-draft dev iteration (#153)`.

**Scope expansion: form_builder catalog → API registry alignment.** First
end-to-end verify failed: `GET /form-definitions/{formId}` 500'd. Dispatched
a general-purpose subagent to walk the hydration code path. Findings
([detail in 0008](../decisions/0008-form-builder-catalog-aligns-with-api-registry.md)):
the field picker's "Primitives" tab advertised refs like `components/text`
and `blocks/name` that the API's domain-specific registry doesn't know about
— so every draft 500'd on `UnresolvableComponentError`, masked by the global
exception filter as a generic 500. Decided to fix the catalog inside this PR
(option B in the agent's writeup) rather than ship a 422-translation
band-aid:

- Field picker: dropped the Primitives tab; Blocks now iterates
  `REGISTRY_BLOCKS`; Components is the default active tab. Every ref a user
  can click is now one the API can resolve.
- `getRegistryItem` in `packages/form-builder/src/catalog.ts` falls back to
  `REGISTRY_COMPONENTS` / `REGISTRY_BLOCKS` so the step editor's display-name
  lookup works for registry-keyed refs.
- `@govtech-bb/registry` added as a dep of `@govtech-bb/form-builder`.
- Fixed a stale `moduleNameMapper` in the form-builder package's
  `jest.config.ts` (`<rootDir>/../../packages/$1/...` resolved to
  `packages/packages/...`). Only surfaced now because our registry import is
  the first non-type `@govtech-bb/*` import in the package's src — all prior
  imports were `import type` and got erased by ts-jest before resolution.

One commit: `2cd11b9 fix(form_builder): field picker emits API-registered refs only`.

**Diagnostic detour: phantom migration row.** Second verify still 500'd
after the catalog fix. The error wasn't visible — the global exception filter
strips non-`HttpException` errors to a generic message. Patched
`apps/api/src/common/exception.filter.ts` with a temporary `console.error` on
500s, captured the stack, reverted the patch. Root cause was outside this
PR entirely: the `form_disabled_overrides` table didn't exist locally, even
though `migrations` table row #8 said `CreateFormDisabledOverrides1779466523478`
had run. Phantom row from a previously rolled-back migration. User
manually deleted the row and re-ran `pnpm run migration:run` to get the
table. Once the table existed, the round-trip worked.

## Why we did it that way

**Scope-expand into this PR rather than file a follow-up.** The plan's
verify step is "save a draft and confirm `GET /form-definitions/{formId}`
returns the saved schema." If we shipped only the `RECIPE_SOURCE=both`
plumbing, the dev loop the issue asks for would still be broken because the
saved drafts can't hydrate. The catalog-fix is small (one UI file, one
catalog helper, one jest config nit) and the alternative — translating the
hydration error to a 422 — leaves the dev loop unusable. The catalog change
also has its own ADR because it sets a principle (`form_builder catalog ⊆
API registry`), not just a fix.

**DB latest by `createdAt`, not max-semver, in `getRecipe({formId})`.** With
`both` mode and no version supplied, we ask each source for its latest then
semver-compare. For files the loader uses semver-latest natively. For DB the
existing `db` branch uses `findOne({ order: { createdAt: "DESC" } })` — we
kept that, even though it has a quirk: if a dev saves v1.5.0 then later
re-saves an older v1.0.0, the DB candidate is v1.0.0 and a file v1.2.0
would shadow it. Flagged the trade-off to the user during read-back. Picking
max-semver would require fetching all rows for the formId or a more complex
query; the createdAt path matches existing semantics and is fine for the
Save-draft loop where authors iterate on one version.

**Export `compareSemver`, don't duplicate.** The helper was file-private in
`recipe-file-loader.service.ts`. The "both" path needs the same comparison.
Exporting keeps one source of truth; the alternative (copying 10 lines) is
worse because future tweaks have to land twice. Surface area cost is one
named export.

**Left `packages/form-builder/src/builtins/` in place.** The package's spec
suite is fixture-heavy and asserts on refs like `components/text` that come
from those builtins. Rewriting `BUILTIN_COMPONENTS` to derive from
`@govtech-bb/registry` would break those tests, expanding the diff into
test-rewrite work outside #153's blast radius. The UI no longer reads from
them, so they're inert from a user perspective; retiring them is a follow-up
once the package specs are migrated to registry-backed fixtures.

**Hint copy: "Saved drafts are served by the local API immediately — no PR
needed."** Original draft used "no redeploy" but PR is the operative concept
in this repo's publish flow — that's what the dev is escaping with `both`
mode. Kept the button label as "Save draft" so the hint adds context without
competing with the action.

**Did not log the catalog drift to a system-wide enforcement.** The save
boundary in `apps/form_builder_api/src/routes/forms.ts` doesn't validate
refs against the registry — a JSON paste or AI-assisted recipe build can
still persist unresolvable refs. We considered adding a server-side check
here; deferred because (1) the picker change makes accidental drift through
the UI impossible, (2) the validation belongs to the form-builder-api,
which is its own service surface, and (3) it's a separate principle worth
deciding deliberately (do we reject at save time, or annotate as
"unresolvable" and let GET 422?). Tracked as a follow-up in 0008.

## Open items / follow-ups

- **`apps/form_builder_api` ref validation at POST `/builder/forms`.**
  Today, an unresolvable-ref recipe persists silently and 500s only on the
  GET round-trip. Worth deciding policy: reject at save, or allow + flag.
- **Retire `packages/form-builder/src/builtins/`.** Migrate the
  fixture-heavy specs onto registry-backed fixtures and delete the in-package
  builtin files. Mentioned in 0008.
- **Retire `RECIPE_SOURCE=db`.** With `both` covering dev iteration, the
  DB-only mode has no remaining use case. Mentioned in the plan's follow-up
  list.
- **Builder shadowing warning.** When a DB draft shadows a published
  on-disk recipe at the same `formId+version`, surface a warning in
  `/builder/ui`. Mentioned in the plan's follow-up list.
- **Phantom migration row.** A previous session left
  `CreateFormDisabledOverrides1779466523478` in the `migrations` table
  without the corresponding `form_disabled_overrides` table. Not specific to
  this work but flagged: if other devs hit the same 500, this is the
  likely cause.
- **`apps/forms/src/routeTree.gen.ts` quote-style regen + new
  `apps/form_builder/.env.example BUILDER_API_URL`** are in the working
  tree but not from this session; left for whoever owns them.

## Tests

- `pnpm exec nx test api --no-coverage` — 61 suites / 562 tests pass
  (1 pre-existing skip).
- `pnpm exec jest` in `packages/form-builder` — 2 suites / 37 tests pass.
- Form-builder app typecheck (`tsc --noEmit`) — no new errors. 5 pre-existing
  errors in `apps/form_builder/app/server/registry.ts` are on `dev` already
  and unrelated.
- Manual: `curl http://localhost:3001/form-definitions` and per-formId GET
  for a fresh draft both return hydrated contracts after the migration
  table was repaired.

## Branch state

Tip at `2cd11b9 fix(form_builder): field picker emits API-registered refs
only`. Two commits ahead of the merge point. Plan doc, ADR 0008, and this
summary committed as docs in a third commit. PR target should match the rest
of the recipe-files work — `dev`.
