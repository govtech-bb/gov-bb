# Recipe visibility launch gate (#1646 Phase 1)

**Date:** 2026-06-25
**Issue:** #1646 (security, severity:important); feature-flags #1517
**Shipped:** prod hotfix #1674 first, then ported to sandbox (this PR)

## What this did

Added a recipe-level **visibility launch gate** so a service that isn't public
yet can't have its form submitted via the direct `/forms/<formId>` side door,
and feature-flagged the 5 forms from #1517 whose submission emails are
misrouted.

- `packages/form-types` — optional `meta.visibility` (`public | preview |
  draft`, default `public`) on `serviceContractRecipeSchema` only, plus a
  `getRecipeVisibility()` helper. `meta` is optional so existing recipes still
  validate; absent meta/visibility ⇒ `public`.
- `apps/api` — gate enforced at the single recipe-resolution chokepoint
  `FormDefinitionsService.getRecipe`: a non-public recipe resolves to `null` for
  the public, so the single-form GET 404s and draft-create version pinning
  inherits the same 404. A valid preview token (`RECIPE_PREVIEW_TOKEN` /
  `X-Recipe-Preview`) bypasses it. The list endpoint (files + DB paths) also
  hides non-public forms.
- The `form_disabled_overrides` 410 kill switch is untouched and stays ahead of
  the visibility check. See ADR 0058.

## Why it looks the way it does

- **Gate in `getRecipe`, not just the controller.** Code review found
  `POST /form-drafts` resolves recipes via `getRecipe` directly (a public
  endpoint); putting the gate only in `findByFormId` would let a preview form
  still get a draft row created. Moving the gate down into `getRecipe` made
  every consumer inherit it from one place.

- **`visibility` ≠ `disabled`** — two axes, two mechanisms (ADR 0058).

## prod vs sandbox divergence (why this isn't a cherry-pick of #1674)

prod still uses the **versioned** recipe layout (no #1196 migration); sandbox
uses **canonical flat** files. So:
- On prod the public is served the latest *versioned* file → the flag went
  there. On sandbox the *canonical flat* file wins → the flag goes there
  instead. Same 5 forms gated on both, via the file each branch actually serves.
- The api `getRecipe` "both" path, the loader's `findAll`, and the schema's
  `version` optionality all differ between branches, so the gate was re-applied
  to sandbox's structure rather than patched in.

## Verification

`form-types:test`, full `api:test` (coverage gates met), `nx build`, `tsc -b`,
`form-types:lint`. On the prod hotfix the gate was additionally validated
end-to-end against a real running API (flagged forms 404 / preview-token 200 /
list-hides-non-public) and the prod deploy's "verify ECS deployment landed"
guard passed.
