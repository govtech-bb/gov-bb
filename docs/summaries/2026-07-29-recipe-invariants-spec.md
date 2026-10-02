# Session summary — Fix inert recipe-invariants spec (#2075)

**Date:** 2026-07-29 · **Branch:** `fix-recipe-invariants-spec-2075` (off `main`) · resolves #2075

## What shipped

[recipe-invariants.spec.ts](apps/api/src/forms/form-definitions/recipe-invariants.spec.ts)
now actually validates recipes. Both `it()` blocks previously scanned `recipes/`
for **directories**, but recipes are 76 flat `recipes/{formId}.json` files with
zero subdirs — so the loops iterated nothing and both tests passed vacuously.
The rework scans the flat files and re-creates the loader's invariants, plus
negative tests that prove malformed recipes are caught.

## Why it looks the way it does

- **Corrected the issue's framing.** The issue says a bad recipe "throws at boot
  → circuit-breaker rollback." Reading the current
  [recipe-file-loader.service.ts](apps/api/src/forms/form-definitions/recipe-file-loader.service.ts)
  showed it now catches per-file errors and **logs-and-skips** (`loadAll`) —
  so a malformed recipe is *silently dropped* (form goes missing), not a boot
  crash. The CI value is identical either way; the framing was adjusted to match
  reality.

- **Mirror the loader's real invariants:** `serviceContractRecipeSchema` parse +
  `formId === filename`. The old `filename === version` assertion and the
  `semverDesc`/"pick latest version" machinery were removed — versioning was
  retired (#1196), so there's one canonical file per form and the filename *is*
  the formId.

- **Ref resolution is a serve-time check, deliberately included.** Refs
  (`components/*`, `blocks/*`) only resolve at serve time via
  `RegistryService.hydrateForm`, not at boot — so an unresolvable ref is a
  serve-time failure today. The issue's acceptance criteria list "unknown ref"
  as a must-catch, so the spec asserts every `ref` exists in `BUILTIN_REGISTRY`
  (keyed by ref), closing that gap in CI. This is the exact class of bug that
  slipped through in #2071.

- **Duplicate-id check is explicit because the schema doesn't do it.**
  `serviceContractRecipeSchema` is a plain `z.object` with no `superRefine`, so
  it never rejects duplicate `stepId`/`fieldId`. The AC lists "duplicate id" as
  a must-catch, so the spec checks uniqueness itself — `stepId` across the
  recipe, `fieldId` per step (components contribute `overrides.fieldId`, blocks
  contribute their `overrides` keys). Per-step `fieldId` scope was chosen because
  it matches the schema's "fieldIds are referenced within the same step"
  semantics and passes all 76 real recipes with no false positives.

- **Negative tests mutate a real recipe rather than adding a fixture file.**
  Dropping a malformed `.json` into `recipes/` would pollute the real set (and
  the loader would just skip it). Instead each negative case `structuredClone`s
  a real recipe and mutates it (drop a required field, rename the formId, add an
  unresolvable ref, duplicate a step), then asserts `checkRecipe` reports a
  problem.

- **Non-empty assertion guards the regression itself.** Both tests
  `expect(recipes.length).toBeGreaterThan(0)` — if the scan ever finds nothing
  again, the invariant checks can't pass vacuously.

## Verification

- The spec: all 76 real recipes pass; the 5 negative tests each fail as intended.
- `nx run api:test` — full suite green (1195 passed, 9 skipped), coverage gate met.
- Change is test-only; no production code touched.
